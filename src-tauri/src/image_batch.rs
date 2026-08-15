//! Runs several queued image jobs through a single NCNN process.
//!
//! `realesrgan-ncnn-vulkan` accepts a directory for `-i` and `-o` and will
//! process everything in it. The queue previously never used that: it spawned
//! one process per image, paying Vulkan initialisation and model load --
//! one to three seconds, and entirely fixed -- for every file. On a batch of
//! ordinary photos that startup cost is most of the wall clock.
//!
//! Grouping is only safe because every process argument that varies per job
//! (model, GPU, scale, tile size) has to be identical across the group;
//! [`can_group_with`] is the check, and the queue only ever groups a run of
//! adjacent jobs that pass it, so execution order is unchanged.
//!
//! What the group does *not* share is identity. Each member keeps its own
//! job id, its own reserved output path, its own cancellation flag and its
//! own terminal state -- which is what makes per-item cancellation and
//! per-item error attribution expressible at all. Attribution is by
//! observation rather than inference: a member succeeded if its output file
//! was actually produced, regardless of what the shared process's exit code
//! claimed about the batch as a whole.
//!
//! Nor do members share a fate in time. Each is handed to its reserved
//! output path and marked finished the moment its own image is done, rather
//! than waiting for the slowest member of the group. That is what keeps a
//! late "cancel everything" from discarding results the user already has:
//! cancellation can only stop work that has not happened yet.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use tauri::{AppHandle, Manager};

use crate::engine::output_format::OutputFormat;
use crate::error::AppError;
use crate::job_queue::{resolve_effective_scale, sanitize_job_id, Job};
use crate::job_state::JobState;
use crate::job_store::JobStore;
use crate::process_runner::{ProcessHandle, ProcessRunner, StdProcessRunner};
use crate::sidecar_manager::resolve_sidecar_path;
use crate::video_pipeline::context::TempFolderGuard;

/// How many images one process may be given.
///
/// The cap is about blast radius, not throughput. Measured on an RTX 3050
/// with 640x480 sources, process startup is ~3.0s against ~4.3s of GPU work
/// per image, which puts the ceiling at `1 + startup/work` -- about 1.70x --
/// and a group of 8 already reaches 92% of it, 16 reaches 96%. Going from 16
/// to 32 buys ~2%.
///
/// Group size no longer costs the user anything if they change their mind:
/// members are delivered and finalised the moment their own image is
/// finished, so cancelling the group only ever stops work that had not been
/// done yet. 32 is simply where the remaining gain stops being worth the
/// extra staging on disk.
pub const MAX_BATCH_SIZE: usize = 32;

const POLL_INTERVAL: Duration = Duration::from_millis(120);

/// Whether two image jobs can share a process.
///
/// Every one of these becomes a command-line argument, so a difference in
/// any of them means the two jobs simply cannot be the same invocation.
/// Videos are never grouped: each runs a whole extract/upscale/reassemble
/// pipeline of its own.
#[must_use]
pub fn can_group_with(first: &Job, other: &Job) -> bool {
    !first.is_video
        && !other.is_video
        && first.model_name == other.model_name
        && first.gpu_id == other.gpu_id
        && first.scale == other.scale
        && first.tile_size == other.tile_size
        // The preset decides both the tile the governor is asked for and
        // whether -x is passed, so two jobs on different presets are simply
        // not the same invocation.
        && first.preset == other.preset
        // Becomes the `-f` argument, and decides both the extension the
        // output lands under and how completeness is detected.
        && first.output_format == other.output_format
}

/// One job's participation in a shared run.
pub struct BatchMember {
    pub job: Job,
    pub cancel_requested: Arc<AtomicBool>,
}

/// The staged filename for member `index`.
///
/// Deliberately not derived from the user's file name: two inputs from
/// different directories can share one, and NCNN keys its output on the
/// stem. A positional name is collision-free by construction and maps
/// straight back to the member it came from.
fn member_stem(index: usize) -> String {
    format!("{index:04}")
}

/// The extension a member's input keeps when staged.
///
/// The engine picks its decoder by extension for WEBP and sniffs the content
/// for everything else, so a `.webp` staged under any other name would fail
/// to load. Anything unrecognised is staged as `.png`, where content
/// sniffing takes over.
fn staged_extension(input_path: &str) -> &'static str {
    match Path::new(input_path)
        .extension()
        .and_then(|e| e.to_str())
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("webp") => "webp",
        Some("jpg") => "jpg",
        Some("jpeg") => "jpeg",
        _ => "png",
    }
}

/// Places a member's input into the shared input directory.
///
/// Tries a hard link first, but expect the copy: the staging directory
/// lives in the app cache (the system drive) and media usually does not, and
/// a hard link cannot cross volumes. Measured on the development machine,
/// media on `D:` and cache on `C:` fails with `ERROR_NOT_SAME_DEVICE` every
/// time, so the copy is the normal path rather than the exception.
///
/// That is accepted rather than worked around. Staging next to the inputs
/// instead would make the link succeed, but it means writing into the user's
/// own media folders, which fails outright on read-only or network locations
/// and needs this same fallback anyway. The copy is bounded by the group
/// size and is noise next to a run measured in minutes.
fn stage_input(source: &Path, destination: &Path) -> Result<(), AppError> {
    if fs::hard_link(source, destination).is_ok() {
        return Ok(());
    }
    fs::copy(source, destination).map_err(|e| {
        AppError::exec(format!(
            "Failed to stage '{}' for batch upscaling: {e}",
            source.display()
        ))
    })?;
    Ok(())
}

/// Moves a produced output to the path reserved for it, falling back to a
/// copy when the two are on different volumes (where rename cannot work).
fn deliver_output(produced: &Path, reserved: &str) -> Result<(), AppError> {
    if fs::rename(produced, reserved).is_ok() {
        return Ok(());
    }
    fs::copy(produced, reserved)
        .map_err(|e| AppError::exec(format!("Failed to write '{reserved}': {e}")))?;
    let _ = fs::remove_file(produced);
    Ok(())
}

struct BatchDirs {
    input: PathBuf,
    output: PathBuf,
}

fn prepare_dirs(app: &AppHandle, group_id: &str) -> Result<(BatchDirs, TempFolderGuard), AppError> {
    let cache_dir = app
        .path()
        .app_cache_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    // Same defence as the video pipeline's temp directory: this path is
    // recursively deleted, so it must never be able to escape the cache dir.
    let safe_id = sanitize_job_id(group_id);
    let root = cache_dir.join(format!("upscaler_batch_{safe_id}"));
    if root.parent() != Some(cache_dir.as_path()) {
        return Err(AppError::exec(
            "Invalid batch id: refusing to build an unsafe temp path",
        ));
    }

    let guard = TempFolderGuard(root.clone());
    let dirs = BatchDirs {
        input: root.join("in"),
        output: root.join("out"),
    };

    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&dirs.input)
        .map_err(|e| AppError::exec(format!("Failed to create batch input folder: {e}")))?;
    fs::create_dir_all(&dirs.output)
        .map_err(|e| AppError::exec(format!("Failed to create batch output folder: {e}")))?;

    Ok((dirs, guard))
}

/// How many members' outputs have appeared so far.
///
/// NCNN works through the directory in name order, and the staged names are
/// positional, so the count of produced outputs is also the index of the
/// image currently being worked on. This is the progress signal rather than
/// the percentage the engine prints, which describes only the image in
/// front of it and restarts for each one.
fn produced_count(output_dir: &Path, member_count: usize, format: OutputFormat) -> usize {
    (0..member_count)
        .take_while(|i| is_complete_image(&member_output(output_dir, *i, format), format))
        .count()
}

/// Where member `index`'s output lands inside the shared output directory.
fn member_output(output_dir: &Path, index: usize, format: OutputFormat) -> PathBuf {
    output_dir.join(format!("{}.{}", member_stem(index), format.extension()))
}

/// Reads the last `n` bytes of a file, or `None` if it is shorter than that.
fn read_tail(path: &Path, n: usize) -> Option<Vec<u8>> {
    use std::io::{Read, Seek, SeekFrom};

    let mut file = fs::File::open(path).ok()?;
    let offset = i64::try_from(n).ok()?;
    file.seek(SeekFrom::End(-offset)).ok()?;
    let mut tail = vec![0u8; n];
    file.read_exact(&mut tail).ok()?;
    Some(tail)
}

/// Whether an image on disk has been written all the way through.
///
/// "The file exists" is not "the file is finished": the engine's save threads
/// create the file and then fill it, so a member handed over on existence
/// alone could be a truncated image delivered to the user and marked
/// succeeded. Each container has a terminator written only once the image is
/// complete, so its tail answers the question exactly -- no guessing from
/// file sizes settling, and no dependence on how many save threads the
/// profile happens to use.
fn is_complete_image(path: &Path, format: OutputFormat) -> bool {
    match format {
        // A fixed 12-byte IEND chunk.
        OutputFormat::Png => {
            const IEND: [u8; 12] = [
                0x00, 0x00, 0x00, 0x00, b'I', b'E', b'N', b'D', 0xAE, 0x42, 0x60, 0x82,
            ];
            read_tail(path, IEND.len()).is_some_and(|tail| tail == IEND)
        }
        // The EOI marker. Unlike IEND this is only two bytes, so it could in
        // principle appear as the final two bytes of a truncated file by
        // chance -- but the engine writes each file once, sequentially, and
        // a partial write ending exactly on FFD9 would have to be a
        // coincidence at the one offset that matters.
        OutputFormat::Jpg => read_tail(path, 2).is_some_and(|tail| tail == [0xFF, 0xD9]),
        // WEBP is RIFF: bytes 4..8 hold the payload length, and the file is
        // complete when it is that length plus the 8-byte header. A size
        // check rather than a terminator, because RIFF has no end marker.
        OutputFormat::Webp => is_complete_webp(path),
    }
}

fn is_complete_webp(path: &Path) -> bool {
    use std::io::Read;

    let Ok(mut file) = fs::File::open(path) else {
        return false;
    };
    let mut header = [0u8; 12];
    if file.read_exact(&mut header).is_err() {
        return false;
    }
    if &header[0..4] != b"RIFF" || &header[8..12] != b"WEBP" {
        return false;
    }
    let declared = u32::from_le_bytes([header[4], header[5], header[6], header[7]]);
    let expected = u64::from(declared).saturating_add(8);
    fs::metadata(path).is_ok_and(|m| m.len() >= expected && expected > 8)
}

/// Which members can be handed over now: everything below the completed
/// frontier that has not already been delivered, and that the user has not
/// cancelled.
fn newly_deliverable(produced: usize, delivered: &[bool], cancelled: &[bool]) -> Vec<usize> {
    (0..produced)
        .filter(|&i| !delivered[i] && !cancelled[i])
        .collect()
}

/// The percentage to report for each member, given how far the run has got.
///
/// Members behind the frontier are finished, the one at it gets whatever the
/// engine last reported for the image it is on, and the rest have not
/// started. A member reports 100 only once its file genuinely exists.
fn member_percentages(member_count: usize, produced: usize, current_pct: Option<f64>) -> Vec<f64> {
    (0..member_count)
        .map(|i| match i.cmp(&produced) {
            std::cmp::Ordering::Less => 100.0,
            std::cmp::Ordering::Equal => current_pct.unwrap_or(0.0).clamp(0.0, 99.9),
            std::cmp::Ordering::Greater => 0.0,
        })
        .collect()
}

/// What to say about one member while the shared run is in progress.
///
/// Each row describes its own situation rather than restating the group's.
/// The engine's percentage is deliberately not quoted here: in directory
/// mode it describes only the image in front of it, and for anything smaller
/// than a single tile it never leaves 0.00 -- a figure that reads as a
/// measurement of the row it is printed on when it is nothing of the kind.
/// The row's own progress bar already carries what is known.
fn member_phase(index: usize, produced: usize, total: usize) -> String {
    match index.cmp(&produced) {
        std::cmp::Ordering::Less => "Upscaled — waiting for the batch to finish".to_string(),
        std::cmp::Ordering::Equal => {
            format!("Upscaling in shared batch ({} of {total})", produced + 1)
        }
        std::cmp::Ordering::Greater => format!("Queued in shared batch ({} of {total})", index + 1),
    }
}

/// Builds the shared process's argument list, and reports the tile size the
/// governor actually settled on so a VRAM failure can name it.
fn build_args(job: &Job, dirs: &BatchDirs, app: &AppHandle) -> (Vec<String>, i32) {
    let models_dir = crate::model_manager::resolve_model_dir(app, &job.model_name);
    let gpu_vram_mb = crate::job_queue::get_gpu_vram_mb_for_id(app, job.gpu_id);
    let effective_scale = resolve_effective_scale(&job.model_name, job.scale, Some(&models_dir));
    let requested_tile = crate::engine::preset::effective_requested_tile(job.tile_size, job.preset);
    let exec_profile = crate::engine::vram_governor::calculate_safe_execution_profile(
        gpu_vram_mb,
        requested_tile,
        effective_scale,
        false,
    );

    let mut args = vec![
        "-i".to_string(),
        dirs.input.to_string_lossy().to_string(),
        "-o".to_string(),
        dirs.output.to_string_lossy().to_string(),
        "-n".to_string(),
        job.model_name.clone(),
        "-m".to_string(),
        models_dir.to_str().unwrap_or("models").to_string(),
        "-g".to_string(),
        job.gpu_id.to_string(),
        "-s".to_string(),
        effective_scale.to_string(),
        "-t".to_string(),
        exec_profile.tile_size.to_string(),
        "-j".to_string(),
        crate::engine::preset::apply_io_threads(&exec_profile.thread_arg, job.preset),
        // Pin the output extension so the produced file name is derivable
        // from the staged one. Same value build_output_path used to name the
        // reserved path, so this is not a second opinion about format.
        "-f".to_string(),
        job.output_format.extension().to_string(),
        "-v".to_string(),
    ];
    if job.preset.profile().tta {
        args.push("-x".to_string());
    }

    (args, exec_profile.tile_size)
}

/// Runs a group of image jobs as one process and reports each member's fate.
///
/// The returned vector is parallel to `members`. A member that was cancelled
/// individually gets [`AppError::Cancelled`] and its output is discarded; a
/// member whose output never appeared gets a failure carrying whatever the
/// shared process said, made explicit as shared context rather than passed
/// off as a diagnosis of that particular image.
pub fn run_image_batch(
    app: &AppHandle,
    members: &[BatchMember],
    shared_handle: &Arc<Mutex<Option<Box<dyn ProcessHandle>>>>,
) -> Vec<Result<(), AppError>> {
    match run_image_batch_inner(app, members, shared_handle) {
        Ok(outcomes) => outcomes,
        // A failure before the process was even running (staging, spawn,
        // sidecar resolution) is not attributable to any one member.
        Err(err) => members
            .iter()
            .map(|m| {
                if m.cancel_requested.load(Ordering::SeqCst) {
                    Err(AppError::Cancelled)
                } else {
                    Err(AppError::exec(err.to_string()))
                }
            })
            .collect(),
    }
}

#[allow(clippy::too_many_lines)]
fn run_image_batch_inner(
    app: &AppHandle,
    members: &[BatchMember],
    shared_handle: &Arc<Mutex<Option<Box<dyn ProcessHandle>>>>,
) -> Result<Vec<Result<(), AppError>>, AppError> {
    let sidecar_path = resolve_sidecar_path(app, "realesrgan-ncnn-vulkan")?;
    let (dirs, _guard) = prepare_dirs(app, &members[0].job.id)?;

    for (index, member) in members.iter().enumerate() {
        // The stem is positional so outputs map straight back to members;
        // the extension is the source's so the engine decodes it correctly.
        // `-f png` below fixes the output extension regardless of the input,
        // which is what makes `{stem}.png` the one name to look for.
        let destination = dirs.input.join(format!(
            "{}.{}",
            member_stem(index),
            staged_extension(&member.job.input_path)
        ));
        stage_input(Path::new(&member.job.input_path), &destination)?;
    }

    let output_format = members[0].job.output_format;
    let (args, effective_tile) = build_args(&members[0].job, &dirs, app);
    let handle = StdProcessRunner::new().spawn(&sidecar_path, &args)?;
    {
        let mut guard = shared_handle
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        *guard = Some(handle);
    }

    let store = JobStore::global();
    let mut last_reported = vec![-1.0f64; members.len()];
    // Members cancelled part-way through are transitioned as soon as that is
    // noticed, rather than at the end of a run they may have minutes left
    // in. Their staged input is deliberately left in place: NCNN builds its
    // file list once at startup, so removing a file it still intends to open
    // would fail the whole batch to save one image's worth of GPU time.
    let mut announced_cancel = vec![false; members.len()];
    // Members handed over to their reserved output path mid-run. Once a
    // member is delivered it is finished and out of reach of a later
    // cancellation -- work that is already done cannot be undone, and
    // discarding it would be the batch throwing away results the user had
    // already paid for.
    let mut delivered = vec![false; members.len()];
    let mut stderr_log = String::new();
    let mut vram_exhausted = false;

    loop {
        let all_cancelled = members
            .iter()
            .all(|m| m.cancel_requested.load(Ordering::SeqCst));
        if all_cancelled {
            if let Ok(mut guard) = shared_handle.lock() {
                if let Some(ref mut child) = *guard {
                    let _ = child.kill();
                }
            }
            return Ok(delivered
                .iter()
                .map(|&done| {
                    if done {
                        Ok(())
                    } else {
                        Err(AppError::Cancelled)
                    }
                })
                .collect());
        }

        let current_pct = {
            let mut guard = shared_handle
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            let Some(ref mut child) = *guard else { break };
            // Checked while the process is alive, not after it exits: NCNN
            // keeps submitting work to a device it has already failed to
            // allocate on, and on a laptop driving its display from that
            // same GPU the result is a frozen desktop rather than an error.
            // Killing here turns a machine lockup into a failed job.
            if crate::engine::vram_governor::is_vram_exhaustion(&child.get_stderr_log()) {
                let _ = child.kill();
                vram_exhausted = true;
                break;
            }
            match child.try_wait() {
                Ok(Some(0)) => {
                    stderr_log = child.get_stderr_log();
                    break;
                }
                Ok(Some(code)) => {
                    // A non-zero exit says the batch had a problem, not
                    // which image had it. Fall through to per-member
                    // attribution by output, keeping the log as context.
                    stderr_log =
                        format!("Engine exited with code {code}: {}", child.get_stderr_log());
                    break;
                }
                Ok(None) => child.latest_progress(),
                Err(e) => return Err(e),
            }
        };

        let produced = produced_count(&dirs.output, members.len(), output_format);

        // Hand over everything that has finished, rather than holding the
        // whole group hostage to its slowest member. Each row reaches its
        // terminal state (and writes its history entry) the moment its own
        // image is done.
        let cancelled: Vec<bool> = members
            .iter()
            .map(|m| m.cancel_requested.load(Ordering::SeqCst))
            .collect();
        for index in newly_deliverable(produced, &delivered, &cancelled) {
            let member = &members[index];
            let source = member_output(&dirs.output, index, output_format);
            match deliver_output(&source, &member.job.output_path) {
                Ok(()) => {
                    delivered[index] = true;
                    store.transition(app, &member.job.id, JobState::Succeeded, Some("Complete"));
                }
                Err(err) => {
                    // Leave it undelivered; the end-of-run pass reports it
                    // against whatever the shared process had to say.
                    eprintln!("batch delivery failed for {}: {err}", member.job.id);
                }
            }
        }

        let percentages = member_percentages(members.len(), produced, current_pct);

        for (index, member) in members.iter().enumerate() {
            // A delivered member is finished; it has nothing left to report,
            // and a cancellation arriving now cannot take it back.
            if delivered[index] {
                continue;
            }
            if cancelled[index] {
                if !announced_cancel[index] {
                    announced_cancel[index] = true;
                    store.transition(
                        app,
                        &member.job.id,
                        JobState::Cancelled,
                        Some("Cancelled by user"),
                    );
                }
                continue;
            }
            // Only report a value that actually moved. The store coalesces
            // whatever arrives inside its flush window, so a 32-member group
            // still costs the webview one event -- but there is no reason to
            // mark thirty rows dirty when one of them changed.
            if (percentages[index] - last_reported[index]).abs() < 0.1 {
                continue;
            }
            last_reported[index] = percentages[index];
            store.update_progress(
                app,
                &member.job.id,
                percentages[index],
                Some(&member_phase(index, produced, members.len())),
                None,
                None,
            );
        }

        thread::sleep(POLL_INTERVAL);
    }

    Ok(collect_outcomes(
        members,
        &dirs.output,
        &stderr_log,
        &delivered,
        vram_exhausted.then_some(effective_tile),
        output_format,
    ))
}

/// Decides each member's fate from what is actually on disk.
///
/// `vram_exhausted_tile` carries the effective tile size when the run was
/// stopped for GPU memory exhaustion. Members that never produced an image
/// are then reported against that cause rather than the generic "no output
/// was produced", which would leave the user with no idea what to change.
fn collect_outcomes(
    members: &[BatchMember],
    output_dir: &Path,
    stderr_log: &str,
    delivered: &[bool],
    vram_exhausted_tile: Option<i32>,
    format: OutputFormat,
) -> Vec<Result<(), AppError>> {
    members
        .iter()
        .enumerate()
        .map(|(index, member)| {
            // Already handed over during the run. Its result is on disk at
            // the reserved path and its row is terminal; nothing here gets
            // to reconsider that.
            if delivered[index] {
                return Ok(());
            }

            let produced = member_output(output_dir, index, format);

            if member.cancel_requested.load(Ordering::SeqCst) {
                // The engine may have produced this one between the cancel
                // landing and the process stopping. It was never delivered,
                // so discard it: a cancelled job leaves no output behind.
                let _ = fs::remove_file(&produced);
                return Err(AppError::Cancelled);
            }

            if !is_complete_image(&produced, format) {
                // Either nothing was written, or the process died partway
                // through writing it. A half-written image is not a result.
                let _ = fs::remove_file(&produced);
                if let Some(tile) = vram_exhausted_tile {
                    return Err(crate::engine::vram_governor::vram_exhausted_error(tile));
                }
                return Err(AppError::exec(format!(
                    "No output was produced for this image by the shared batch process. {stderr_log}"
                )));
            }

            deliver_output(&produced, &member.job.output_path)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn image_job(id: &str) -> Job {
        Job {
            id: id.to_string(),
            input_path: format!("C:\\media\\{id}.png"),
            output_path: format!("C:\\media\\{id}_upscaled_4x.png"),
            model_name: "realesrgan-x4plus".to_string(),
            gpu_id: 0,
            scale: 4,
            tile_size: 256,
            is_video: false,
            preset: crate::engine::preset::QualityPreset::Balanced,
            output_format: OutputFormat::Png,
        }
    }

    #[test]
    fn test_identical_image_jobs_group() {
        assert!(can_group_with(&image_job("a"), &image_job("b")));
    }

    #[test]
    fn test_any_differing_process_argument_prevents_grouping() {
        let base = image_job("a");

        let mut other_model = image_job("b");
        other_model.model_name = "realesrgan-x4plus-anime".to_string();
        assert!(!can_group_with(&base, &other_model));

        let mut other_gpu = image_job("b");
        other_gpu.gpu_id = 1;
        assert!(!can_group_with(&base, &other_gpu));

        let mut other_scale = image_job("b");
        other_scale.scale = 2;
        assert!(!can_group_with(&base, &other_scale));

        let mut other_tile = image_job("b");
        other_tile.tile_size = 128;
        assert!(!can_group_with(&base, &other_tile));

        // The preset decides whether -x is on the command line and which
        // tile the governor is asked for. Grouping across it would run one
        // of the two images at settings its row never asked for -- and the
        // difference is invisible, because both would still succeed.
        let mut other_preset = image_job("b");
        other_preset.preset = crate::engine::preset::QualityPreset::Quality;
        assert!(!can_group_with(&base, &other_preset));
    }

    #[test]
    fn test_videos_never_group() {
        let mut video = image_job("v");
        video.is_video = true;

        // Neither direction: a video runs a whole pipeline of its own.
        assert!(!can_group_with(&video, &image_job("a")));
        assert!(!can_group_with(&image_job("a"), &video));

        let mut other_video = image_job("v2");
        other_video.is_video = true;
        assert!(!can_group_with(&video, &other_video));
    }

    #[test]
    fn test_member_stems_are_positional_and_sort_in_queue_order() {
        assert_eq!(member_stem(0), "0000");
        assert_eq!(member_stem(9), "0009");
        assert_eq!(member_stem(31), "0031");

        // NCNN walks the directory in name order, so the staged names have
        // to sort the same way the queue does.
        let mut names: Vec<String> = (0..12).map(member_stem).collect();
        let original = names.clone();
        names.sort();
        assert_eq!(names, original);
    }

    #[test]
    fn test_staged_extension_keeps_what_the_decoder_needs() {
        // WEBP is the one the engine dispatches on by extension rather than
        // by sniffing content, so it must survive staging intact.
        assert_eq!(staged_extension("C:\\media\\shot.webp"), "webp");
        assert_eq!(staged_extension("C:\\media\\shot.WEBP"), "webp");

        assert_eq!(staged_extension("C:\\media\\shot.jpg"), "jpg");
        assert_eq!(staged_extension("C:\\media\\shot.JPEG"), "jpeg");
        assert_eq!(staged_extension("C:\\media\\shot.png"), "png");

        // Unknown or absent falls back to png, where content sniffing
        // decides -- never to an extension that would pick a wrong decoder.
        assert_eq!(staged_extension("C:\\media\\shot.bmp"), "png");
        assert_eq!(staged_extension("C:\\media\\noextension"), "png");
    }

    #[test]
    fn test_member_percentages_track_the_produced_frontier() {
        // Nothing produced yet: the first image carries the engine's figure.
        assert_eq!(member_percentages(3, 0, Some(40.0)), vec![40.0, 0.0, 0.0]);

        // Two done, the third in flight, none left after it.
        assert_eq!(
            member_percentages(3, 2, Some(10.0)),
            vec![100.0, 100.0, 10.0]
        );

        // Everything produced.
        assert_eq!(
            member_percentages(3, 3, Some(99.0)),
            vec![100.0, 100.0, 100.0]
        );
    }

    #[test]
    fn test_member_phase_describes_that_member_not_the_group() {
        // Three members, the first already produced, the second in flight.
        assert!(member_phase(0, 1, 3).starts_with("Upscaled"));
        assert_eq!(member_phase(1, 1, 3), "Upscaling in shared batch (2 of 3)");
        assert_eq!(member_phase(2, 1, 3), "Queued in shared batch (3 of 3)");

        // Nothing engine-reported is quoted as this row's own figure: in
        // directory mode the percentage belongs to whichever image the
        // engine is on, and never leaves 0.00 for sub-tile images.
        for index in 0..3 {
            assert!(!member_phase(index, 1, 3).contains('%'));
        }
    }

    #[test]
    fn test_a_member_is_never_reported_complete_before_its_file_exists() {
        // The engine's percentage is per-image and reaches 100 well before
        // the file is written, so it is clamped below 100 for the in-flight
        // member -- only the produced frontier can report completion.
        let pcts = member_percentages(2, 0, Some(100.0));
        assert!(pcts[0] < 100.0);
    }

    const IEND_BYTES: [u8; 12] = [
        0x00, 0x00, 0x00, 0x00, b'I', b'E', b'N', b'D', 0xAE, 0x42, 0x60, 0x82,
    ];

    /// A file that looks like a finished PNG to `is_complete_png`.
    fn write_complete_png(path: &Path) {
        let mut bytes = b"\x89PNG\r\n\x1a\n....pixels....".to_vec();
        bytes.extend_from_slice(&IEND_BYTES);
        fs::write(path, bytes).unwrap();
    }

    /// A file the engine has created but not finished writing.
    fn write_partial_png(path: &Path) {
        fs::write(path, b"\x89PNG\r\n\x1a\n....half the pixels....").unwrap();
    }

    /// A RIFF/WEBP container whose declared payload length matches its size.
    fn write_webp(path: &Path, payload: &[u8], declared_len: u32) {
        let mut bytes = b"RIFF".to_vec();
        bytes.extend_from_slice(&declared_len.to_le_bytes());
        bytes.extend_from_slice(b"WEBP");
        bytes.extend_from_slice(payload);
        fs::write(path, bytes).unwrap();
    }

    #[test]
    fn test_completeness_is_format_specific() {
        // Each container is finished by a different signal, and using the
        // PNG rule on a JPEG would mean either never delivering it or --
        // worse -- delivering it half-written and marking it succeeded.
        let dir = std::env::temp_dir().join("upscaly_format_complete");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();

        // JPEG: the two-byte EOI marker.
        fs::write(dir.join("done.jpg"), b"\xFF\xD8....scan data....\xFF\xD9").unwrap();
        fs::write(dir.join("half.jpg"), b"\xFF\xD8....scan da").unwrap();
        assert!(is_complete_image(&dir.join("done.jpg"), OutputFormat::Jpg));
        assert!(!is_complete_image(&dir.join("half.jpg"), OutputFormat::Jpg));

        // WEBP: RIFF declares its payload length up front, so a short file
        // is detectable even though the container has no end marker.
        // "WEBP" + 12 bytes of payload = 16 bytes after the length field.
        write_webp(&dir.join("done.webp"), b"vp8ldatadata", 16);
        write_webp(&dir.join("half.webp"), b"vp8l", 16);
        assert!(is_complete_image(
            &dir.join("done.webp"),
            OutputFormat::Webp
        ));
        assert!(!is_complete_image(
            &dir.join("half.webp"),
            OutputFormat::Webp
        ));

        // A file that is not the format claimed is not "complete" either.
        write_complete_png(&dir.join("actually.png"));
        assert!(!is_complete_image(
            &dir.join("actually.png"),
            OutputFormat::Webp
        ));
        assert!(!is_complete_image(
            &dir.join("missing.jpg"),
            OutputFormat::Jpg
        ));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_member_output_follows_the_chosen_format() {
        let dir = Path::new("C:\\tmp");
        assert!(member_output(dir, 0, OutputFormat::Png).ends_with("0000.png"));
        assert!(member_output(dir, 7, OutputFormat::Jpg).ends_with("0007.jpg"));
        assert!(member_output(dir, 12, OutputFormat::Webp).ends_with("0012.webp"));
    }

    #[test]
    fn test_a_differing_output_format_prevents_grouping() {
        // -f is a process argument, so two jobs wanting different containers
        // cannot be the same invocation -- and the completeness check that
        // decides when each member is deliverable is format-specific too.
        let base = image_job("a");
        let mut other = image_job("b");
        other.output_format = OutputFormat::Jpg;
        assert!(!can_group_with(&base, &other));
    }

    #[test]
    fn test_completeness_is_decided_by_the_png_end_marker() {
        let dir = std::env::temp_dir().join("upscaly_png_complete");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();

        write_complete_png(&dir.join("done.png"));
        write_partial_png(&dir.join("half.png"));
        fs::write(dir.join("empty.png"), b"").unwrap();

        assert!(is_complete_image(&dir.join("done.png"), OutputFormat::Png));
        // Existing and non-empty, but still being written. Delivering this
        // would hand the user a truncated image marked as succeeded.
        assert!(!is_complete_image(&dir.join("half.png"), OutputFormat::Png));
        assert!(!is_complete_image(
            &dir.join("empty.png"),
            OutputFormat::Png
        ));
        assert!(!is_complete_image(
            &dir.join("missing.png"),
            OutputFormat::Png
        ));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_produced_count_stops_at_the_first_gap_or_unfinished_file() {
        let dir = std::env::temp_dir().join("upscaly_produced_count");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();

        write_complete_png(&dir.join("0000.png"));
        write_complete_png(&dir.join("0001.png"));
        // A gap, then a later file: the frontier is contiguous, so this
        // must not be counted as three done.
        write_complete_png(&dir.join("0003.png"));

        assert_eq!(produced_count(&dir, 4, OutputFormat::Png), 2);

        // Filling the gap with a file that is still being written must not
        // advance the frontier either -- save threads can finish out of
        // order, so a later file existing says nothing about this one.
        write_partial_png(&dir.join("0002.png"));
        assert_eq!(produced_count(&dir, 4, OutputFormat::Png), 2);

        write_complete_png(&dir.join("0002.png"));
        assert_eq!(produced_count(&dir, 4, OutputFormat::Png), 4);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_newly_deliverable_skips_delivered_and_cancelled_members() {
        // Frontier at 4: members 0..3 are finished. 0 is already handed
        // over, 2 was cancelled, 4 has not finished yet.
        let delivered = [true, false, false, false, false];
        let cancelled = [false, false, true, false, false];

        assert_eq!(newly_deliverable(4, &delivered, &cancelled), vec![1, 3]);
        // Nothing finished yet means nothing to hand over.
        assert!(newly_deliverable(0, &delivered, &cancelled).is_empty());
    }

    #[test]
    fn test_cancelled_member_is_reported_cancelled_and_leaves_no_output() {
        let dir = std::env::temp_dir().join("upscaly_batch_outcomes");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        write_complete_png(&dir.join("0000.png"));

        let members = vec![BatchMember {
            job: image_job("a"),
            cancel_requested: Arc::new(AtomicBool::new(true)),
        }];

        let outcomes = collect_outcomes(&members, &dir, "", &[false], None, OutputFormat::Png);
        assert!(outcomes[0].as_ref().is_err_and(AppError::is_cancellation));
        // The engine can finish an image between the cancel landing and the
        // process stopping. That one was never handed over, so it goes.
        assert!(!dir.join("0000.png").exists());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_a_delivered_member_survives_a_later_cancellation() {
        let dir = std::env::temp_dir().join("upscaly_batch_delivered");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();

        // Delivered mid-run: its output already sits at the reserved path,
        // and nothing is left in the batch directory.
        let members = vec![BatchMember {
            job: image_job("a"),
            cancel_requested: Arc::new(AtomicBool::new(true)),
        }];

        let outcomes = collect_outcomes(&members, &dir, "", &[true], None, OutputFormat::Png);

        // Cancelling after the fact cannot undo work that is already done
        // and already in the user's hands.
        assert!(outcomes[0].is_ok());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_a_half_written_output_is_a_failure_not_a_result() {
        let dir = std::env::temp_dir().join("upscaly_batch_truncated");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();

        let out = dir.join("delivered.png");
        let _ = fs::remove_file(&out);
        let mut job = image_job("a");
        job.output_path = out.to_string_lossy().to_string();

        // The process died partway through writing this one. It exists and
        // is non-empty, which is exactly why size alone cannot be trusted.
        write_partial_png(&dir.join("0000.png"));

        let members = vec![BatchMember {
            job,
            cancel_requested: Arc::new(AtomicBool::new(false)),
        }];
        let outcomes =
            collect_outcomes(&members, &dir, "killed", &[false], None, OutputFormat::Png);

        assert!(outcomes[0].is_err());
        // A truncated image must never reach the user's output path.
        assert!(!out.exists());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_missing_output_fails_only_the_member_it_belongs_to() {
        let dir = std::env::temp_dir().join("upscaly_batch_attribution");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();

        let out_a = dir.join("delivered_a.png");
        let _ = fs::remove_file(&out_a);

        let mut job_a = image_job("a");
        job_a.output_path = out_a.to_string_lossy().to_string();
        let job_b = image_job("b");

        // Only the first member's output was produced.
        write_complete_png(&dir.join("0000.png"));

        let members = vec![
            BatchMember {
                job: job_a,
                cancel_requested: Arc::new(AtomicBool::new(false)),
            },
            BatchMember {
                job: job_b,
                cancel_requested: Arc::new(AtomicBool::new(false)),
            },
        ];

        let outcomes = collect_outcomes(
            &members,
            &dir,
            "Engine exited with code 1: vk error",
            &[false, false],
            None,
            OutputFormat::Png,
        );

        // One failure in a shared process must not fail its neighbours.
        assert!(outcomes[0].is_ok());
        assert!(out_a.exists());
        let err = outcomes[1].as_ref().unwrap_err().to_string();
        assert!(err.contains("No output was produced"));
        // The shared log is attached as context, not presented as this
        // image's own diagnosis.
        assert!(err.contains("vk error"));

        let _ = fs::remove_file(&out_a);
        let _ = fs::remove_dir_all(&dir);
    }
}
