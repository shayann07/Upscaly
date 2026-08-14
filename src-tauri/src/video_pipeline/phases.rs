use std::collections::VecDeque;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::AppHandle;

use crate::model_manager::get_models_dir;
use crate::process_runner::{ProcessRunner, StdProcessRunner};
use crate::sidecar_manager::resolve_sidecar_path;
use crate::video_pipeline::context::VideoJobContext;
use crate::video_pipeline::encoder::reassemble_with_encoders;

#[derive(Debug, Clone)]
pub struct VideoMetadata {
    pub fps_string: String,
    pub total_frames_estimate: Option<usize>,
}

pub struct ExtractionControl {
    pub is_finished: Arc<AtomicBool>,
    pub error_msg: Arc<Mutex<Option<String>>>,
}

/// Spawns multi-threaded fast frame extraction in a background thread writing to staging_dir.
pub fn spawn_background_extraction(
    ctx: &VideoJobContext,
    ffmpeg_binary: &str,
    fps_string: &str,
) -> Result<ExtractionControl, String> {
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
        .map_err(|e| format!("Failed to spawn FFmpeg extractor: {e}"))?;

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
    })
}

#[allow(
    clippy::cast_precision_loss,
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss
)]
pub fn run_overlapping_upscale_pipeline(
    ctx: &VideoJobContext,
    ffmpeg_binary: &str,
    meta: &VideoMetadata,
) -> Result<usize, String> {
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
    let mut exec_profile = crate::engine::vram_governor::calculate_safe_execution_profile(
        gpu_vram_mb,
        ctx.job.tile_size,
        true,
    );

    let mut total_discovered_frames = 0usize;
    let mut batch_index = 0usize;
    let mut history_window: VecDeque<(Instant, usize)> = VecDeque::with_capacity(32);
    #[allow(unused_assignments)]
    let mut total_completed = 0usize;
    let warmup_frames_required = 5;
    let batch_target_size = 40usize;

    loop {
        if ctx.is_cancelled() {
            return Err("cancelled".to_string());
        }

        // If the extractor died partway through (disk full, corrupt stream,
        // decoder crash), the video is truncated. Fail the whole job
        // immediately instead of quietly reassembling whatever frames made
        // it out and reporting "Succeeded" -- a truncated video with no
        // error is worse than an explicit failure.
        if extraction.is_finished.load(Ordering::SeqCst) {
            if let Ok(err_lock) = extraction.error_msg.lock() {
                if let Some(ref err) = *err_lock {
                    return Err(format!("Video frame extraction failed partway through: {err}"));
                }
            }
        }

        // Collect ready frames from staging_dir
        let mut ready_frames = get_sorted_image_files(&ctx.staging_dir);
        let extraction_done = extraction.is_finished.load(Ordering::SeqCst);

        // While extraction is still running, the lexicographically-last
        // frame may still be the one ffmpeg is actively writing -- a
        // directory listing can show a file before all its bytes are
        // flushed and the handle closed. Taking it risked NCNN decoding a
        // partially-written JPEG, and the rename below could hit a sharing
        // violation on Windows while ffmpeg still had it open. Leave it in
        // staging for one more tick; once a newer frame appears after it,
        // that proves this one is fully written.
        if !extraction_done {
            ready_frames.pop();
        }

        if ready_frames.is_empty() {
            if extraction_done {
                // All extraction is complete and no more frames to process
                break;
            }
            // Wait for extractor to produce frames
            thread::sleep(Duration::from_millis(60));
            continue;
        }

        // Only start NCNN if we have enough frames for a batch, OR if extraction has finished
        if ready_frames.len() < batch_target_size && !extraction_done {
            let current_staging_count = ready_frames.len();
            let estimated_total = meta
                .total_frames_estimate
                .unwrap_or(current_staging_count.max(1));
            ctx.emit_progress_with_meta(
                2.0 + ((current_staging_count as f64 / estimated_total as f64) * 6.0).min(6.0),
                &format!("Extracting Video Frames ({current_staging_count} / {estimated_total})"),
                None,
                None,
            );
            thread::sleep(Duration::from_millis(60));
            continue;
        }

        // Prepare next batch folder
        batch_index += 1;
        let batch_dir = ctx.job_temp_dir.join(format!("batch_{batch_index:06}"));
        fs::create_dir_all(&batch_dir)
            .map_err(|e| format!("Failed to create batch folder: {e}"))?;

        // Take up to batch_target_size * 2 frames (or all if extraction is done)
        let count_to_take = if extraction_done {
            ready_frames.len()
        } else {
            ready_frames.len().min(batch_target_size * 2)
        };

        let batch_items = ready_frames.drain(..count_to_take).collect::<Vec<_>>();
        let batch_count = batch_items.len();
        total_discovered_frames += batch_count;

        for frame_path in batch_items {
            if let Some(file_name) = frame_path.file_name() {
                let target_path = batch_dir.join(file_name);
                let _ = fs::rename(&frame_path, &target_path);
            }
        }

        // Spawn NCNN on this batch with safe VRAM profile
        let upscale_args = vec![
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
            exec_profile.thread_arg.clone(),
            "-v".to_string(),
        ];

        let runner = StdProcessRunner::new();
        let upscale_handle = runner
            .spawn(&sidecar_path, &upscale_args)
            .map_err(|e| format!("Failed to spawn NCNN engine: {e}"))?;

        let ncnn_handle_id = upscale_handle.id();
        ctx.register_handle(upscale_handle);

        // Poll NCNN execution for this batch
        loop {
            if ctx.is_cancelled() {
                ctx.unregister_handle(ncnn_handle_id);
                let _ = fs::remove_dir_all(&batch_dir);
                return Err("cancelled".to_string());
            }

            let is_batch_done = {
                let mut list = ctx
                    .active_handles
                    .lock()
                    .unwrap_or_else(std::sync::PoisonError::into_inner);
                if let Some(pos) = list.iter().position(|h| h.id() == ncnn_handle_id) {
                    match list[pos].try_wait() {
                        Ok(Some(0)) => {
                            list.remove(pos);
                            Some(Ok(()))
                        }
                        Ok(Some(code)) => {
                            let stderr_log = list[pos].get_stderr_log();
                            list.remove(pos);
                            if stderr_log.contains("vkAllocateMemory failed")
                                || stderr_log.contains("vkQueueSubmit failed")
                            {
                                Some(Err("GPU VRAM allocation failed (Vulkan memory overflow). Try selecting a smaller tile size (e.g. 256px or 128px).".to_string()))
                            } else {
                                Some(Err(format!("NCNN upscale engine failed with exit code {code}: {stderr_log}")))
                            }
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

            total_completed = count_image_files(&ctx.frames_out_dir);
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
                    Err(err)
                        if err.contains("Vulkan memory overflow")
                            || err.contains("vkAllocateMemory") =>
                    {
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
                        exec_profile.thread_arg = "1:1:1".to_string();
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

            thread::sleep(Duration::from_millis(100));
        }
    }

    if ctx.is_cancelled() {
        return Err("cancelled".to_string());
    }

    let final_completed = count_image_files(&ctx.frames_out_dir);
    if final_completed == 0 {
        return Err(
            "No video frames were upscaled. Please verify GPU drivers and input file.".to_string(),
        );
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
) -> Result<(), String> {
    let Some(total_frames) = meta.total_frames_estimate else {
        // Unknown duration/frame count -- nothing reliable to estimate
        // against, so don't block the job over a guess.
        return Ok(());
    };

    // Conservative per-frame estimate for a q:v2 JPEG source frame; the
    // upscaled output frame is estimated to grow with the scaled pixel
    // area (scale^2), which is intentionally generous since JPEG tends to
    // compress larger images more efficiently per pixel, not less.
    const SOURCE_FRAME_BYTES: u64 = 300_000;
    let scale = effective_scale.max(1) as u64;
    let scale_area = scale * scale;
    let output_frame_bytes = SOURCE_FRAME_BYTES.saturating_mul(scale_area);
    let required_bytes = (total_frames as u64)
        .saturating_mul(SOURCE_FRAME_BYTES.saturating_add(output_frame_bytes));

    match crate::model_manager::get_available_disk_space(&ctx.job_temp_dir) {
        Ok(available_bytes) if available_bytes < required_bytes => {
            let required_mb = required_bytes / 1_000_000;
            Err(crate::error::AppError::InsufficientStorage { required_mb }.to_string())
        }
        // If the query itself fails, don't block the job on an unreliable
        // check -- proceed and let the actual pipeline surface any real
        // disk-full error.
        _ => Ok(()),
    }
}

fn count_image_files(dir: &Path) -> usize {
    fs::read_dir(dir)
        .map(|entries| {
            entries
                .filter_map(Result::ok)
                .filter(|entry| {
                    entry.path().extension().is_some_and(|ext| {
                        ext.eq_ignore_ascii_case("jpg") || ext.eq_ignore_ascii_case("png")
                    })
                })
                .count()
        })
        .unwrap_or(0)
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
) -> Result<(), String> {
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

    let out_frame_pattern = ctx.frames_out_dir.join(format!("frame_%08d.{sample_ext}"));
    let normalized_pattern = out_frame_pattern.to_string_lossy().replace('\\', "/");

    ctx.emit_progress(92.0, "Reassembling Video & Merging Audio Stream...");
    reassemble_with_encoders(ctx, ffmpeg_binary, fps_string, &normalized_pattern)
}

#[allow(
    clippy::cast_precision_loss,
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss
)]
pub fn probe_video_metadata(app: &AppHandle, video_path: &str) -> Result<VideoMetadata, String> {
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
        .map_err(|e| format!("Failed to run ffprobe: {e}"))?;

    crate::sidecar_manager::attach_to_job_object(&child);

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

    let start_time = Instant::now();
    let succeeded = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status.success(),
            Ok(None) => {
                if start_time.elapsed() > Duration::from_secs(10) {
                    let _ = child.kill();
                    let _ = child.wait();
                    break false;
                }
                thread::sleep(Duration::from_millis(50));
            }
            Err(_) => {
                let _ = child.kill();
                break false;
            }
        }
    };

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

pub fn resolve_ffmpeg_binary(app: &AppHandle) -> Result<String, String> {
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

    Err("FFmpeg binary was not found. Bundled sidecar missing and no system PATH installation present.".to_string())
}

pub fn resolve_ffprobe_binary(app: &AppHandle) -> Result<String, String> {
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

    Err("FFprobe binary was not found. Bundled sidecar missing and no system PATH installation present.".to_string())
}
