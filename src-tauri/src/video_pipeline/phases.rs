use std::collections::VecDeque;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::AppHandle;

use crate::error::AppError;
use crate::model_manager::get_models_dir;
use crate::process_runner::{ProcessRunner, StdProcessRunner};
use crate::sidecar_manager::resolve_sidecar_path;
use crate::video_pipeline::context::VideoJobContext;
use crate::video_pipeline::encoder::{reassemble_streaming, reassemble_with_encoders};

#[derive(Debug, Clone)]
pub struct VideoMetadata {
    pub fps_string: String,
    pub total_frames_estimate: Option<usize>,
}

/// Staged-frame count at which the extractor is paused. ffmpeg decodes far
/// faster than the GPU upscales, so left alone it writes the entire video to
/// disk as JPEGs long before the pipeline needs them -- tens of GB on a long
/// source, for frames that will sit untouched for minutes. Well above the
/// 600 a single batch can take, so the GPU never waits on this.
const EXTRACTION_HIGH_WATER: usize = 2000;
/// Resume threshold. Hysteresis, not a single mark, so a batch draining just
/// past the line does not thrash suspend/resume every poll tick.
const EXTRACTION_LOW_WATER: usize = 1000;

// Enforced at compile time: the resume mark must be strictly below the pause
// mark or a draining batch would thrash suspend/resume every poll tick, and
// both must clear the 600 frames a single batch can take or the GPU would
// end up waiting on an extractor we paused.
const _: () = assert!(EXTRACTION_LOW_WATER < EXTRACTION_HIGH_WATER);
const _: () = assert!(EXTRACTION_LOW_WATER > 600);

pub struct ExtractionControl {
    pub is_finished: Arc<AtomicBool>,
    pub error_msg: Arc<Mutex<Option<String>>>,
    /// Extractor pid, used to pause/resume it for backpressure.
    pid: u32,
    is_suspended: AtomicBool,
}

impl ExtractionControl {
    /// Pauses the extractor once staging is deep enough that further decoding
    /// is pure disk cost, and resumes it once the GPU has drained back down.
    ///
    /// No-op once extraction has finished, and on platforms where suspending
    /// is unavailable (see `process_runner::suspend_process`) -- there the
    /// extractor simply runs unthrottled as before, with the pre-flight disk
    /// check still guarding the failure case.
    pub fn apply_backpressure(&self, staged: usize) {
        if self.is_finished.load(Ordering::SeqCst) {
            return;
        }
        let suspended = self.is_suspended.load(Ordering::SeqCst);
        if !suspended && staged >= EXTRACTION_HIGH_WATER {
            if crate::process_runner::suspend_process(self.pid) {
                self.is_suspended.store(true, Ordering::SeqCst);
            }
        } else if suspended
            && staged <= EXTRACTION_LOW_WATER
            && crate::process_runner::resume_process(self.pid)
        {
            self.is_suspended.store(false, Ordering::SeqCst);
        }
    }

    /// Lets the extractor run again unconditionally.
    ///
    /// The pipeline loop can only exit normally once extraction reports
    /// finished, which a paused extractor never will, so this mainly guards
    /// the error paths -- and makes the invariant explicit rather than
    /// relying on the handle-kill in the caller to collect a paused process.
    pub fn resume_if_suspended(&self) {
        if self.is_suspended.swap(false, Ordering::SeqCst) {
            crate::process_runner::resume_process(self.pid);
        }
    }
    /// The extractor's recorded failure, if it died partway through.
    ///
    /// Must be consulted both inside the pipeline loop and once more after
    /// it exits. The extractor writes `error_msg` and then sets
    /// `is_finished`, so a failure landing between the loop's in-flight
    /// check and its own `is_finished` read reaches the
    /// "staging empty + extraction done" branch, which breaks out of the
    /// loop -- every frame that *was* extracted upscales fine, and the job
    /// would report success over a silently truncated video.
    pub fn failure(&self) -> Option<String> {
        self.error_msg
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone()
    }
}

/// Spawns multi-threaded fast frame extraction in a background thread writing to `staging_dir`.
pub fn spawn_background_extraction(
    ctx: &VideoJobContext,
    ffmpeg_binary: &str,
    fps_string: &str,
) -> Result<ExtractionControl, AppError> {
    let input_frame_pattern = ctx.staging_dir.join("frame_%08d.jpg");
    let extract_args = vec![
        "-y".to_string(),
        "-threads".to_string(),
        "0".to_string(),
        "-i".to_string(),
        ctx.job.input_path.clone(),
        // Force the same constant frame rate here that reassemble_video
        // later declares via -framerate. The previous -vsync 0 extracted
        // one image per *source* frame at its original (possibly
        // variable) timestamps, which reassembly then reinterpreted as a
        // plain CFR sequence at fps_string -- on VFR sources (phone
        // recordings, screen captures) this drifted the video against the
        // untouched, separately-muxed audio track over the length of the
        // output, silently truncated further by -shortest.
        "-vsync".to_string(),
        "cfr".to_string(),
        "-r".to_string(),
        fps_string.to_string(),
        "-q:v".to_string(),
        "2".to_string(),
        // Pin full chroma resolution on the intermediate JPEG instead of
        // letting ffmpeg fall back to default 4:2:0 -- more color detail
        // for the upscaler to work with. (The previous "-pix_fmt rgb24"
        // was a no-op here: mjpeg doesn't support rgb24, so ffmpeg was
        // silently substituting its own default anyway.)
        "-pix_fmt".to_string(),
        "yuvj444p".to_string(),
        input_frame_pattern.to_string_lossy().to_string(),
    ];

    let runner = StdProcessRunner::new();
    let extract_handle = runner
        .spawn(&PathBuf::from(ffmpeg_binary), &extract_args)
        .map_err(|e| AppError::exec(format!("Failed to spawn FFmpeg extractor: {e}")))?;

    let handle_id = extract_handle.id();
    ctx.register_handle(extract_handle);

    let is_finished = Arc::new(AtomicBool::new(false));
    let is_finished_clone = Arc::clone(&is_finished);
    let error_msg = Arc::new(Mutex::new(None));
    let error_msg_clone = Arc::clone(&error_msg);

    let cancel_requested = Arc::clone(&ctx.cancel_requested);
    let active_handles = Arc::clone(&ctx.active_handles);

    thread::spawn(move || loop {
        if cancel_requested.load(Ordering::SeqCst) {
            let mut list = active_handles
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            if let Some(pos) = list.iter().position(|h| h.id() == handle_id) {
                let mut handle = list.remove(pos);
                let _ = handle.kill();
            }
            is_finished_clone.store(true, Ordering::SeqCst);
            return;
        }

        let status = {
            let mut list = active_handles
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            if let Some(pos) = list.iter().position(|h| h.id() == handle_id) {
                match list[pos].try_wait() {
                    Ok(Some(0)) => {
                        list.remove(pos);
                        Some(Ok(()))
                    }
                    Ok(Some(code)) => {
                        let log = list[pos].get_stderr_log();
                        list.remove(pos);
                        Some(Err(format!(
                            "FFmpeg extraction failed with exit code {code}: {log}"
                        )))
                    }
                    Ok(None) => None,
                    Err(e) => {
                        list.remove(pos);
                        Some(Err(e.to_string()))
                    }
                }
            } else {
                Some(Ok(()))
            }
        };

        if let Some(res) = status {
            if let Err(e) = res {
                if let Ok(mut lock) = error_msg_clone.lock() {
                    *lock = Some(e);
                }
            }
            is_finished_clone.store(true, Ordering::SeqCst);
            break;
        }

        thread::sleep(Duration::from_millis(50));
    });

    Ok(ExtractionControl {
        is_finished,
        error_msg,
        pid: handle_id,
        is_suspended: AtomicBool::new(false),
    })
}

// Long by line count because the overlapping extract/upscale/reassemble
// batches share a lot of loop-local state (VRAM retry, staging counts,
// throughput history) that would need threading through several function
// signatures if split up -- not a natural seam to cut along.
#[allow(
    clippy::cast_precision_loss,
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    clippy::too_many_lines
)]
pub fn run_overlapping_upscale_pipeline(
    ctx: &VideoJobContext,
    ffmpeg_binary: &str,
    meta: &VideoMetadata,
) -> Result<usize, AppError> {
    // get_sorted_image_files does a full directory read + sort of
    // staging_dir, and count_image_files a full directory read of
    // frames_out_dir, on every loop tick -- for a long video these can
    // hold tens to hundreds of thousands of entries by the later stages of
    // a job, pegging a core on repeated full scans for no benefit beyond a
    // marginally smoother progress bar. 60-100ms was far more often than
    // the UI needs; still smooth at a third of the frequency.
    const STAGING_POLL_INTERVAL: Duration = Duration::from_millis(200);
    const NCNN_POLL_INTERVAL: Duration = Duration::from_millis(300);

    ctx.emit_progress(1.0, "Initializing Hardware-Accelerated Video Pipeline...");

    let models_dir = get_models_dir(ctx.app);
    let effective_scale = crate::job_queue::resolve_effective_scale(
        &ctx.job.model_name,
        ctx.job.scale,
        Some(&models_dir),
    );

    check_available_disk_space(ctx, meta, effective_scale)?;

    let extraction = spawn_background_extraction(ctx, ffmpeg_binary, &meta.fps_string)?;
    let sidecar_path = resolve_sidecar_path(ctx.app, "realesrgan-ncnn-vulkan")?;
    let gpu_vram_mb = crate::job_queue::get_gpu_vram_mb_for_id(ctx.app, ctx.job.gpu_id);
    let requested_tile =
        crate::engine::preset::effective_requested_tile(ctx.job.tile_size, ctx.job.preset);
    let mut exec_profile = crate::engine::vram_governor::calculate_safe_execution_profile(
        gpu_vram_mb,
        requested_tile,
        effective_scale,
        true,
    );

    // TTA multiplies GPU work per frame by eight. On a clip of any length
    // that is the difference between minutes and hours, so it is said out
    // loud before the first frame rather than discovered from the ETA.
    if ctx.job.preset.profile().tta {
        ctx.emit_progress(
            1.0,
            "Quality preset: TTA is on, which runs each frame 8 times. This will take far longer than Balanced.",
        );
    }

    let mut total_discovered_frames = 0usize;
    let mut batch_index = 0usize;
    let mut history_window: VecDeque<(Instant, usize)> = VecDeque::with_capacity(32);
    #[allow(unused_assignments)]
    let mut total_completed = 0usize;
    // Authoritative frames-out count as of the last batch boundary. The poll
    // loop adds its in-flight batch's incremental progress on top of this,
    // and one real directory scan per batch (~300 frames) re-anchors it --
    // instead of one scan per poll tick.
    let mut confirmed_completed = 0usize;
    // Next batch's frames, moved into place while the current batch occupies
    // the GPU. See stage_next_batch.
    let mut pending_batch: Option<PreparedBatch> = None;
    let warmup_frames_required = 5;
    // Each NCNN invocation pays ~1.5-4s of Vulkan instance init + shader
    // compile + model weight upload before it processes a single frame.
    // At the old target of 40 (up to 80 taken per batch), a 10,000-frame
    // video respawned the process 125+ times, idling the GPU for that
    // startup cost every time -- on a fast GPU that alone was 20-30% of
    // total wall clock. Raising this amortizes that fixed cost across far
    // more frames per spawn; the batch folder is just a plain directory of
    // JPEGs, so a larger batch has no VRAM or tiling implications, only
    // slightly higher peak disk usage per in-flight batch (a few hundred
    // JPEG frames, negligible next to the already-unbounded staging dir).
    let batch_target_size = 300usize;

    loop {
        if ctx.is_cancelled() {
            return Err(AppError::Cancelled);
        }

        // If the extractor died partway through (disk full, corrupt stream,
        // decoder crash), the video is truncated. Fail the whole job
        // immediately instead of quietly reassembling whatever frames made
        // it out and reporting "Succeeded" -- a truncated video with no
        // error is worse than an explicit failure.
        if let Some(err) = extraction.failure() {
            return Err(AppError::exec(format!(
                "Video frame extraction failed partway through: {err}"
            )));
        }

        let extraction_done = extraction.is_finished.load(Ordering::SeqCst);

        // Count before listing. On the overwhelming majority of ticks the
        // answer is "not enough frames staged yet", which only needs a
        // number -- building the sorted Vec<PathBuf> is deferred until we
        // have actually committed to forming a batch, so the waiting path no
        // longer sorts and allocates a PathBuf per frame across a staging
        // directory that can hold thousands of them.
        let staged_total = count_image_files(&ctx.staging_dir);

        // Throttle the extractor against how far ahead it has run. Bounds
        // peak staging disk instead of letting ffmpeg decode the whole video
        // out before the GPU has touched a fraction of it.
        extraction.apply_backpressure(staged_total);

        // Prefer a batch already staged while the previous one was upscaling
        // -- its frames are moved and it can be handed straight to NCNN.
        let batch = if let Some(ready) = pending_batch.take() {
            ready
        } else {
            let available = available_staged_frames(staged_total, extraction_done);

            if available == 0 {
                if extraction_done {
                    // All extraction is complete and no more frames to process
                    break;
                }
                // Wait for extractor to produce frames
                thread::sleep(STAGING_POLL_INTERVAL);
                continue;
            }

            // Only start NCNN once there are enough frames for a batch, OR if
            // extraction has finished and this is the remainder.
            if available < batch_target_size && !extraction_done {
                let estimated_total = meta.total_frames_estimate.unwrap_or(available.max(1));
                ctx.emit_progress_with_meta(
                    2.0 + ((available as f64 / estimated_total as f64) * 6.0).min(6.0),
                    &format!("Extracting Video Frames ({available} / {estimated_total})"),
                    None,
                    None,
                );
                thread::sleep(STAGING_POLL_INTERVAL);
                continue;
            }

            batch_index += 1;
            let Some(ready) =
                stage_next_batch(ctx, batch_index, extraction_done, batch_target_size * 2)
            else {
                // Raced with the count above (frames drained or not yet flushed).
                thread::sleep(STAGING_POLL_INTERVAL);
                continue;
            };
            ready
        };

        let batch_dir = batch.dir;
        // NCNN writes one output per input and reuses the input's file name,
        // so these are exactly the names to expect in frames_out_dir. Kept so
        // the poll loop below can advance its completed count incrementally
        // rather than re-walking the whole output directory every tick.
        let batch_output_names = batch.output_names;
        total_discovered_frames += batch_output_names.len();

        // Spawn NCNN on this batch with safe VRAM profile
        let mut upscale_args = vec![
            "-i".to_string(),
            batch_dir.to_string_lossy().to_string(),
            "-o".to_string(),
            ctx.frames_out_dir.to_string_lossy().to_string(),
            "-n".to_string(),
            ctx.job.model_name.clone(),
            "-m".to_string(),
            models_dir.to_str().unwrap_or("models").to_string(),
            "-g".to_string(),
            ctx.job.gpu_id.to_string(),
            "-s".to_string(),
            effective_scale.to_string(),
            "-t".to_string(),
            exec_profile.tile_size.to_string(),
            "-f".to_string(),
            "jpg".to_string(),
            "-j".to_string(),
            crate::engine::preset::apply_io_threads(&exec_profile.thread_arg, ctx.job.preset),
            "-v".to_string(),
        ];
        if ctx.job.preset.profile().tta {
            upscale_args.push("-x".to_string());
        }

        let runner = StdProcessRunner::new();
        let upscale_handle = runner
            .spawn(&sidecar_path, &upscale_args)
            .map_err(|e| AppError::exec(format!("Failed to spawn NCNN engine: {e}")))?;

        let ncnn_handle_id = upscale_handle.id();
        ctx.register_handle(upscale_handle);

        // How many of this batch's outputs have appeared so far. Advanced
        // incrementally by the poll loop; see the walk below.
        let mut batch_completed = 0usize;
        // Pre-staging is attempted exactly once per batch (see below), so a
        // failed attempt does not re-scan the staging dir every tick and
        // undo the incremental-counting win.
        let mut prestage_attempted = false;

        // Poll NCNN execution for this batch
        loop {
            if ctx.is_cancelled() {
                ctx.unregister_handle(ncnn_handle_id);
                let _ = fs::remove_dir_all(&batch_dir);
                return Err(AppError::Cancelled);
            }

            let is_batch_done = {
                let mut list = ctx
                    .active_handles
                    .lock()
                    .unwrap_or_else(std::sync::PoisonError::into_inner);
                if let Some(pos) = list.iter().position(|h| h.id() == ncnn_handle_id) {
                    // Tested before try_wait, on every poll, while the
                    // process is still running. NCNN does not abort on a
                    // failed allocation -- it keeps submitting to a device
                    // it can no longer feed until the driver is lost, and a
                    // check gated on the exit code never fires because the
                    // process never exits. Killing it here is what turns a
                    // frozen desktop back into a retryable job, and this
                    // loop already knows how to retry at a smaller tile.
                    if crate::engine::vram_governor::is_vram_exhaustion(&list[pos].get_stderr_log())
                    {
                        let _ = list[pos].kill();
                        list.remove(pos);
                        Some(Err(crate::engine::vram_governor::vram_exhausted_error(
                            exec_profile.tile_size,
                        )))
                    } else {
                        match list[pos].try_wait() {
                        Ok(Some(0)) => {
                            list.remove(pos);
                            Some(Ok(()))
                        }
                        Ok(Some(code)) => {
                            let stderr_log = list[pos].get_stderr_log();
                            list.remove(pos);
                            Some(Err(AppError::exec(format!("NCNN upscale engine failed with exit code {code}: {stderr_log}"))))
                        }
                        Ok(None) => None,
                        Err(e) => {
                            list.remove(pos);
                            Some(Err(e))
                        }
                        }
                    }
                } else {
                    Some(Ok(()))
                }
            };

            batch_completed = advance_completed_outputs(
                &ctx.frames_out_dir,
                &batch_output_names,
                batch_completed,
            );
            total_completed = confirmed_completed + batch_completed;

            // Halfway through this batch, spend the remaining GPU-busy time
            // moving the next batch's frames into place, so the gap between
            // batches is just process startup rather than startup plus
            // several hundred file renames. Gated on the halfway mark so
            // there is likely enough staged to fill a whole batch, and tried
            // only once so the directory scan stays off the hot path.
            if pending_batch.is_none()
                && !prestage_attempted
                && batch_completed * 2 >= batch_output_names.len()
            {
                prestage_attempted = true;
                let done_now = extraction.is_finished.load(Ordering::SeqCst);
                let staged_now = count_image_files(&ctx.staging_dir);
                if available_staged_frames(staged_now, done_now) >= batch_target_size {
                    batch_index += 1;
                    pending_batch =
                        stage_next_batch(ctx, batch_index, done_now, batch_target_size * 2);
                }
            }

            let total_expected = meta
                .total_frames_estimate
                .unwrap_or(total_discovered_frames.max(total_completed).max(1));

            let now = Instant::now();
            history_window.push_back((now, total_completed));

            while let Some(&(time, _)) = history_window.front() {
                if now.duration_since(time) > Duration::from_secs(20) && history_window.len() > 6 {
                    history_window.pop_front();
                } else {
                    break;
                }
            }

            let upscale_ratio = if total_expected > 0 {
                (total_completed as f64 / total_expected as f64).clamp(0.0, 1.0)
            } else {
                0.0
            };
            let current_progress = 8.0 + (upscale_ratio * 84.0); // 8% to 92%

            let (eta_sec, current_fps) =
                if total_completed >= warmup_frames_required && history_window.len() >= 3 {
                    let &(first_time, first_completed) =
                        history_window.front().expect("history_window is non-empty");
                    let time_delta = now.duration_since(first_time).as_secs_f64();
                    let frame_delta = total_completed.saturating_sub(first_completed);

                    if time_delta > 0.5 && frame_delta > 0 {
                        let fps = frame_delta as f64 / time_delta;
                        let remaining = total_expected.saturating_sub(total_completed);
                        let eta = if fps > 0.01 {
                            (remaining as f64 / fps).ceil() as u64
                        } else {
                            0
                        };
                        (Some(eta), Some((fps * 10.0).round() / 10.0))
                    } else {
                        (None, None)
                    }
                } else {
                    (None, None)
                };

            ctx.emit_progress_with_meta(
                current_progress.min(92.0),
                &format!("Upscaling Video Frames ({total_completed} / {total_expected})"),
                eta_sec,
                current_fps,
            );

            if let Some(res) = is_batch_done {
                match res {
                    Ok(()) => {
                        let _ = fs::remove_dir_all(&batch_dir);
                        break;
                    }
                    // Only the VRAM-overflow branch above constructs a
                    // GpuError here, so matching the variant identifies it
                    // exactly -- where the previous substring test on the
                    // message would have stopped retrying the moment anyone
                    // reworded it.
                    Err(err @ AppError::GpuError { .. }) => {
                        // AUTO delegates tiling to NCNN's own heap heuristic
                        // via tile_size == 0. The old guard required
                        // tile_size > 64, which AUTO can never satisfy (0 is
                        // never > 64) -- ironically making AUTO the only
                        // mode with no VRAM-overflow retry at all. Give it a
                        // concrete starting tile on its first overflow
                        // instead of failing outright; once there's no
                        // smaller tile left to retry with, fail same as
                        // before.
                        if exec_profile.tile_size != 0 && exec_profile.tile_size <= 64 {
                            let _ = fs::remove_dir_all(&batch_dir);
                            return Err(err);
                        }

                        // Move files back to staging directory to retry with safer profile
                        if let Ok(entries) = fs::read_dir(&batch_dir) {
                            for entry in entries.flatten() {
                                let path = entry.path();
                                if let Some(file_name) = path.file_name() {
                                    let target_path = ctx.staging_dir.join(file_name);
                                    let _ = fs::rename(&path, &target_path);
                                }
                            }
                        }
                        let _ = fs::remove_dir_all(&batch_dir);
                        exec_profile.tile_size = if exec_profile.tile_size == 0 {
                            256
                        } else {
                            (exec_profile.tile_size / 2).max(64)
                        };
                        // Drop proc (the middle number) to 1 -- that's the
                        // actual VRAM-reducing measure. Save threads (the
                        // last number) handle CPU-bound JPEG encoding and
                        // don't touch GPU memory at all; forcing them to 1
                        // too (the previous "1:1:1") permanently serialized
                        // output encoding for the rest of the job after a
                        // single VRAM hiccup, for no VRAM benefit.
                        exec_profile.thread_arg = "1:1:2".to_string();
                        ctx.emit_progress_with_meta(
                            current_progress.min(92.0),
                            &format!("VRAM Limit Reached: Automatically Downscaling Tile to {}px & Retrying...", exec_profile.tile_size),
                            eta_sec,
                            current_fps,
                        );
                        break;
                    }
                    Err(err) => {
                        let _ = fs::remove_dir_all(&batch_dir);
                        return Err(err);
                    }
                }
            }

            thread::sleep(NCNN_POLL_INTERVAL);
        }

        // Re-anchor the incremental counter once per batch. This is the only
        // full scan of frames_out_dir in the hot path, and it absorbs
        // anything the per-frame walk above could not see: out-of-order
        // completions, frames NCNN skipped, and the VRAM-retry path that
        // moves a whole batch back to staging to be redone.
        confirmed_completed = count_image_files(&ctx.frames_out_dir);
    }

    // Nothing below consumes staged frames, so leaving the extractor paused
    // here would strand it.
    extraction.resume_if_suspended();

    if ctx.is_cancelled() {
        return Err(AppError::Cancelled);
    }

    // Final gate before declaring success: the loop can exit via the
    // "staging empty + extraction done" break without ever having observed
    // an extractor failure recorded in the intervening window (see
    // ExtractionControl::failure). Everything upscaled cleanly in that
    // case, so nothing below would catch it -- the frame set is simply
    // short, and shipping it silently is exactly the truncated-video-as-
    // success bug this guards against.
    if let Some(err) = extraction.failure() {
        return Err(AppError::exec(format!(
            "Video frame extraction failed partway through: {err}"
        )));
    }

    let final_completed = count_image_files(&ctx.frames_out_dir);
    if final_completed == 0 {
        return Err(AppError::exec(
            "No video frames were upscaled. Please verify GPU drivers and input file.",
        ));
    }

    Ok(final_completed)
}

/// Pre-flight disk-space check: a long video can require tens of GB of
/// intermediate source + upscaled frames. Fail fast with a clear error
/// instead of letting the disk fill up mid-job, which previously produced a
/// silently truncated "successful" output (see the extraction-error fix
/// above) or an opaque ffmpeg/NCNN failure partway through.
#[allow(
    clippy::cast_precision_loss,
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss
)]
fn check_available_disk_space(
    ctx: &VideoJobContext,
    meta: &VideoMetadata,
    effective_scale: i32,
) -> Result<(), AppError> {
    // Conservative per-frame estimate for a q:v2 JPEG source frame; the
    // upscaled output frame is estimated to grow with the scaled pixel
    // area (scale^2), which is intentionally generous since JPEG tends to
    // compress larger images more efficiently per pixel, not less.
    const SOURCE_FRAME_BYTES: u64 = 300_000;

    let Some(total_frames) = meta.total_frames_estimate else {
        // Unknown duration/frame count -- nothing reliable to estimate
        // against, so don't block the job over a guess.
        return Ok(());
    };

    let scale = effective_scale.max(1) as u64;
    let scale_area = scale * scale;
    let output_frame_bytes = SOURCE_FRAME_BYTES.saturating_mul(scale_area);
    let required_bytes =
        (total_frames as u64).saturating_mul(SOURCE_FRAME_BYTES.saturating_add(output_frame_bytes));

    match crate::model_manager::get_available_disk_space(&ctx.job_temp_dir) {
        Ok(available_bytes) if available_bytes < required_bytes => {
            let required_mb = required_bytes / 1_000_000;
            Err(AppError::InsufficientStorage { required_mb })
        }
        // If the query itself fails, don't block the job on an unreliable
        // check -- proceed and let the actual pipeline surface any real
        // disk-full error.
        _ => Ok(()),
    }
}

/// How many staged frames are safe to hand to NCNN right now.
///
/// While extraction is still running, the lexicographically-last staged
/// frame may be the one ffmpeg currently has open -- a directory listing can
/// show a file before all its bytes are flushed and the handle closed.
/// Taking it risks NCNN decoding a partially-written JPEG, and moving it can
/// hit a sharing violation on Windows while ffmpeg still holds it. Hold it
/// back one tick; once a newer frame appears after it, that proves it is
/// fully written.
fn available_staged_frames(staged_total: usize, extraction_done: bool) -> usize {
    if extraction_done {
        staged_total
    } else {
        staged_total.saturating_sub(1)
    }
}

/// A batch directory that has been populated and is ready to hand to NCNN.
struct PreparedBatch {
    dir: PathBuf,
    /// Output file names to expect in `frames_out_dir`, in submission order.
    output_names: Vec<std::ffi::OsString>,
}

/// Moves up to `max_frames` staged frames into a fresh batch directory.
///
/// Populating a batch is pure filesystem work with no GPU involvement, so the
/// caller runs it while the *previous* batch is still upscaling. Several
/// hundred renames between batches was otherwise dead time with the GPU idle
/// -- and on Windows those renames are far more expensive than a bare
/// metadata update, since real-time AV scanning inspects each moved file.
///
/// Returns `None` when there is nothing worth batching yet.
fn stage_next_batch(
    ctx: &VideoJobContext,
    batch_index: usize,
    extraction_done: bool,
    max_frames: usize,
) -> Option<PreparedBatch> {
    let mut ready = get_sorted_image_files(&ctx.staging_dir);
    if !extraction_done {
        // See available_staged_frames: the newest may still be open in ffmpeg.
        ready.pop();
    }
    if ready.is_empty() {
        return None;
    }

    let dir = ctx.job_temp_dir.join(format!("batch_{batch_index:06}"));
    if fs::create_dir_all(&dir).is_err() {
        return None;
    }

    let take = if extraction_done {
        ready.len()
    } else {
        ready.len().min(max_frames)
    };

    let mut output_names = Vec::with_capacity(take);
    for frame_path in ready.drain(..take) {
        if let Some(file_name) = frame_path.file_name() {
            if fs::rename(&frame_path, dir.join(file_name)).is_ok() {
                output_names.push(file_name.to_os_string());
            }
        }
    }

    if output_names.is_empty() {
        let _ = fs::remove_dir_all(&dir);
        return None;
    }
    Some(PreparedBatch { dir, output_names })
}

/// Advances `completed` past every batch output that has appeared in
/// `frames_out_dir`, returning the new count.
///
/// Replaces a full `read_dir` of `frames_out_dir` on every poll tick. That
/// directory only grows -- by the end of a long video it holds every
/// upscaled frame -- so rescanning it per tick made progress reporting
/// O(frames) each time and O(frames^2) across the job, burning a core purely
/// to redraw a progress bar. Walking forward from the last position instead
/// costs one stat per newly finished frame plus one for the frame still in
/// flight.
///
/// Multi-threaded NCNN can finish slightly out of order, so this can briefly
/// lag while an earlier frame is still pending. It catches up as soon as the
/// gap fills, and the caller's authoritative rescan at each batch boundary
/// corrects any residual drift.
fn advance_completed_outputs(
    frames_out_dir: &Path,
    output_names: &[std::ffi::OsString],
    mut completed: usize,
) -> usize {
    while completed < output_names.len() && frames_out_dir.join(&output_names[completed]).exists() {
        completed += 1;
    }
    completed
}

fn count_image_files(dir: &Path) -> usize {
    fs::read_dir(dir).map_or(0, |entries| {
        entries
            .filter_map(Result::ok)
            .filter(|entry| {
                entry.path().extension().is_some_and(|ext| {
                    ext.eq_ignore_ascii_case("jpg") || ext.eq_ignore_ascii_case("png")
                })
            })
            .count()
    })
}

fn get_sorted_image_files(dir: &Path) -> Vec<PathBuf> {
    let mut files = fs::read_dir(dir)
        .map(|entries| {
            entries
                .filter_map(Result::ok)
                .map(|e| e.path())
                .filter(|path| {
                    path.extension().is_some_and(|ext| {
                        ext.eq_ignore_ascii_case("jpg") || ext.eq_ignore_ascii_case("png")
                    })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    files.sort();
    files
}

pub fn reassemble_video(
    ctx: &VideoJobContext,
    ffmpeg_binary: &str,
    fps_string: &str,
) -> Result<(), AppError> {
    let sample_ext = fs::read_dir(&ctx.frames_out_dir)
        .ok()
        .and_then(|mut entries| {
            entries.find_map(|e| {
                if let Ok(entry) = e {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if name.starts_with("frame_") {
                        if Path::new(&name)
                            .extension()
                            .is_some_and(|ext| ext.eq_ignore_ascii_case("png"))
                        {
                            return Some("png");
                        } else if Path::new(&name)
                            .extension()
                            .is_some_and(|ext| ext.eq_ignore_ascii_case("jpg"))
                        {
                            return Some("jpg");
                        }
                    }
                }
                None
            })
        })
        .unwrap_or("jpg");

    ctx.emit_progress(92.0, "Reassembling Video & Merging Audio Stream...");

    // Stream the frames in rather than pointing ffmpeg at a numbered pattern.
    // The pattern form needs every upscaled frame resident until reassembly
    // finishes; feeding them over stdin lets each be deleted the moment it is
    // consumed, so peak disk is the untouched tail instead of the whole video.
    let frames = get_sorted_image_files(&ctx.frames_out_dir);
    if !frames.is_empty() {
        return reassemble_streaming(ctx, ffmpeg_binary, fps_string, frames);
    }

    // Nothing matched the sorted-image listing (unexpected extension, say) --
    // fall back to letting ffmpeg glob the directory itself.
    let out_frame_pattern = ctx.frames_out_dir.join(format!("frame_%08d.{sample_ext}"));
    let normalized_pattern = out_frame_pattern.to_string_lossy().replace('\\', "/");
    reassemble_with_encoders(ctx, ffmpeg_binary, fps_string, &normalized_pattern)
}

// Long by line count because of the timeout + pipe-draining rewrite (see
// comment below) needed to stop a hung ffprobe from wedging the single
// worker thread -- that invariant has to stay inline with the process
// lifecycle it's guarding.
#[allow(
    clippy::cast_precision_loss,
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    clippy::too_many_lines
)]
pub fn probe_video_metadata(app: &AppHandle, video_path: &str) -> Result<VideoMetadata, AppError> {
    let ffprobe_bin = resolve_ffprobe_binary(app)?;

    // Command::output() blocks with no timeout, and the pipeline's single
    // worker thread processes jobs serially -- a dead network share or a
    // pathological file that makes ffprobe hang wedged the current job in
    // Running forever *and* blocked every job queued behind it, with no
    // way to cancel it. Bounded the same way probe_gpus_raw is: drain
    // stdout/stderr on background threads while polling try_wait(), and
    // kill on timeout.
    let mut cmd = Command::new(&ffprobe_bin);
    cmd.args([
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=r_frame_rate,avg_frame_rate,nb_frames,duration",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        video_path,
    ])
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());
    crate::process_runner::suppress_console_window(&mut cmd);

    let mut child = cmd
        .spawn()
        .map_err(|e| AppError::exec(format!("Failed to run ffprobe: {e}")))?;

    let stdout_buf: std::sync::Arc<std::sync::Mutex<String>> = std::sync::Arc::default();
    let stdout_handle = child.stdout.take().map(|mut out| {
        let buf = std::sync::Arc::clone(&stdout_buf);
        thread::spawn(move || {
            use std::io::Read;
            let mut s = String::new();
            let _ = out.read_to_string(&mut s);
            if let Ok(mut guard) = buf.lock() {
                *guard = s;
            }
        })
    });
    // stderr isn't parsed, but must still be drained so the child can
    // never block on a full stderr pipe while we're only reading stdout.
    if let Some(mut err) = child.stderr.take() {
        thread::spawn(move || {
            use std::io::Read;
            let mut s = String::new();
            let _ = err.read_to_string(&mut s);
        });
    }

    // Tracked from here on so an app exit mid-probe reaps it rather than
    // orphaning it (attach_to_job_object happens inside register_process).
    let tracked = crate::sidecar_manager::register_process(child);

    let start_time = Instant::now();
    let succeeded = loop {
        let poll = {
            let mut slot = tracked
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            match slot.as_mut() {
                // kill_all_processes took it: the app is shutting down.
                None => break false,
                Some(child) => child.try_wait(),
            }
        };

        match poll {
            Ok(Some(status)) => break status.success(),
            Ok(None) => {
                if start_time.elapsed() > Duration::from_secs(10) {
                    let mut slot = tracked
                        .lock()
                        .unwrap_or_else(std::sync::PoisonError::into_inner);
                    if let Some(child) = slot.as_mut() {
                        let _ = child.kill();
                        let _ = child.wait();
                    }
                    break false;
                }
                thread::sleep(Duration::from_millis(50));
            }
            Err(_) => {
                let mut slot = tracked
                    .lock()
                    .unwrap_or_else(std::sync::PoisonError::into_inner);
                if let Some(child) = slot.as_mut() {
                    let _ = child.kill();
                    let _ = child.wait();
                }
                break false;
            }
        }
    };

    crate::sidecar_manager::release_process(&tracked);

    if let Some(h) = stdout_handle {
        let _ = h.join();
    }

    if !succeeded {
        return Ok(VideoMetadata {
            fps_string: "30/1".to_string(),
            total_frames_estimate: None,
        });
    }

    let stdout = stdout_buf.lock().map(|g| g.clone()).unwrap_or_default();
    let lines: Vec<&str> = stdout
        .lines()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .collect();

    let mut fps_str = "30/1".to_string();
    let mut total_frames_estimate = None;
    let mut duration_sec: Option<f64> = None;
    let mut parsed_fps: Option<f64> = None;

    for line in lines {
        if line.contains('/') {
            if let Some(fps_val) = parse_fps_fraction(line) {
                if (1.0..=240.0).contains(&fps_val) {
                    fps_str = line.to_string();
                    parsed_fps = Some(fps_val);
                }
            }
        } else if let Ok(frames) = line.parse::<usize>() {
            if frames > 0 {
                total_frames_estimate = Some(frames);
            }
        } else if let Ok(dur) = line.parse::<f64>() {
            if dur > 0.0 && duration_sec.is_none() {
                duration_sec = Some(dur);
            }
        }
    }

    if total_frames_estimate.is_none() {
        if let (Some(dur), Some(fps)) = (duration_sec, parsed_fps) {
            let est = (dur * fps).round() as usize;
            if est > 0 {
                total_frames_estimate = Some(est);
            }
        }
    }

    Ok(VideoMetadata {
        fps_string: fps_str,
        total_frames_estimate,
    })
}

fn parse_fps_fraction(s: &str) -> Option<f64> {
    let parts: Vec<&str> = s.split('/').collect();
    if parts.len() == 2 {
        let num: f64 = parts[0].parse().ok()?;
        let den: f64 = parts[1].parse().ok()?;
        if den > 0.0 {
            return Some(num / den);
        }
    } else if parts.len() == 1 {
        return s.parse().ok();
    }
    None
}

pub fn resolve_ffmpeg_binary(app: &AppHandle) -> Result<String, AppError> {
    if let Ok(path) = resolve_sidecar_path(app, "ffmpeg") {
        if path.exists() {
            return Ok(path.to_string_lossy().to_string());
        }
    }

    let mut ffmpeg_check_cmd = Command::new("ffmpeg");
    ffmpeg_check_cmd
        .arg("-version")
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    crate::process_runner::suppress_console_window(&mut ffmpeg_check_cmd);
    let system_check = ffmpeg_check_cmd.status();

    if let Ok(status) = system_check {
        if status.success() {
            return Ok("ffmpeg".to_string());
        }
    }

    Err(AppError::SidecarNotFound {
        path: "ffmpeg (bundled sidecar missing and not on PATH)".to_string(),
    })
}

pub fn resolve_ffprobe_binary(app: &AppHandle) -> Result<String, AppError> {
    if let Ok(path) = resolve_sidecar_path(app, "ffprobe") {
        if path.exists() {
            return Ok(path.to_string_lossy().to_string());
        }
    }

    let mut ffprobe_check_cmd = Command::new("ffprobe");
    ffprobe_check_cmd
        .arg("-version")
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    crate::process_runner::suppress_console_window(&mut ffprobe_check_cmd);
    let system_check = ffprobe_check_cmd.status();

    if let Ok(status) = system_check {
        if status.success() {
            return Ok("ffprobe".to_string());
        }
    }

    Err(AppError::SidecarNotFound {
        path: "ffprobe (bundled sidecar missing and not on PATH)".to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn extraction_control() -> ExtractionControl {
        ExtractionControl {
            is_finished: Arc::new(AtomicBool::new(false)),
            error_msg: Arc::new(Mutex::new(None)),
            // pid 0 never matches a real process, so backpressure calls in
            // tests are inert rather than suspending something unrelated.
            pid: 0,
            is_suspended: AtomicBool::new(false),
        }
    }

    #[test]
    fn test_extraction_failure_is_visible_without_waiting_for_is_finished() {
        // The extractor records error_msg *before* flipping is_finished.
        // Gating the failure read on is_finished (the old behavior) meant a
        // failure landing in that window was invisible to the pipeline loop,
        // which then broke out on an empty staging dir and reported success
        // over a truncated video.
        let control = extraction_control();
        assert_eq!(control.failure(), None);

        *control
            .error_msg
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = Some("disk full".to_string());

        assert!(!control.is_finished.load(Ordering::SeqCst));
        assert_eq!(control.failure().as_deref(), Some("disk full"));
    }

    #[test]
    fn test_backpressure_is_inert_once_extraction_finished() {
        let control = extraction_control();
        control.is_finished.store(true, Ordering::SeqCst);

        // Well past the high-water mark, but a finished extractor has nothing
        // left to pause -- this must not try to suspend a dead pid.
        control.apply_backpressure(EXTRACTION_HIGH_WATER * 2);
        assert!(!control.is_suspended.load(Ordering::SeqCst));
    }

    #[test]
    fn test_resume_if_suspended_clears_the_flag_once() {
        let control = extraction_control();
        control.is_suspended.store(true, Ordering::SeqCst);

        control.resume_if_suspended();
        assert!(!control.is_suspended.load(Ordering::SeqCst));

        // Idempotent: a second call on an already-running extractor is a no-op.
        control.resume_if_suspended();
        assert!(!control.is_suspended.load(Ordering::SeqCst));
    }

    #[test]
    fn test_available_staged_frames_holds_back_the_in_flight_frame() {
        // Mid-extraction the newest staged frame may still be open in ffmpeg.
        assert_eq!(available_staged_frames(10, false), 9);
        // Once extraction is done every staged frame is fully written.
        assert_eq!(available_staged_frames(10, true), 10);
        // Must not underflow on an empty staging dir.
        assert_eq!(available_staged_frames(0, false), 0);
    }

    #[test]
    fn test_stage_next_batch_moves_frames_and_reports_names() {
        let root = std::env::temp_dir().join(format!("upscaly_stage_test_{}", std::process::id()));
        let staging = root.join("staging");
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&staging).expect("staging dir");

        for i in 1..=5 {
            fs::write(staging.join(format!("frame_{i:08}.jpg")), b"x").expect("write frame");
        }

        // Mid-extraction the newest frame is held back, and the cap applies.
        let mut ready = get_sorted_image_files(&staging);
        ready.pop();
        assert_eq!(ready.len(), 4);

        // Names come back in submission order and the files really moved.
        let names: Vec<String> = ready
            .iter()
            .take(2)
            .filter_map(|p| p.file_name().map(|n| n.to_string_lossy().to_string()))
            .collect();
        assert_eq!(names, vec!["frame_00000001.jpg", "frame_00000002.jpg"]);

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn test_advance_completed_outputs_counts_only_contiguous_arrivals() {
        let dir = std::env::temp_dir().join(format!("upscaly_advance_test_{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("temp dir");

        let names: Vec<std::ffi::OsString> = ["a.jpg", "b.jpg", "c.jpg"]
            .iter()
            .map(std::ffi::OsString::from)
            .collect();

        // Nothing written yet.
        assert_eq!(advance_completed_outputs(&dir, &names, 0), 0);

        fs::write(dir.join("a.jpg"), b"x").expect("write a");
        assert_eq!(advance_completed_outputs(&dir, &names, 0), 1);

        // Out-of-order arrival: "c" exists but "b" does not, so the walk
        // stops at the gap rather than over-reporting. It resumes once the
        // gap fills -- the batch-boundary rescan corrects any residual drift.
        fs::write(dir.join("c.jpg"), b"x").expect("write c");
        assert_eq!(advance_completed_outputs(&dir, &names, 1), 1);

        fs::write(dir.join("b.jpg"), b"x").expect("write b");
        assert_eq!(advance_completed_outputs(&dir, &names, 1), 3);

        // Resuming from an already-complete count must not run past the end.
        assert_eq!(advance_completed_outputs(&dir, &names, 3), 3);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_extraction_failure_persists_for_the_post_loop_check() {
        // failure() must not consume the error -- the pipeline reads it both
        // inside the loop and once more after it exits.
        let control = extraction_control();
        *control
            .error_msg
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = Some("decoder crash".to_string());
        control.is_finished.store(true, Ordering::SeqCst);

        assert_eq!(control.failure().as_deref(), Some("decoder crash"));
        assert_eq!(control.failure().as_deref(), Some("decoder crash"));
    }
}
