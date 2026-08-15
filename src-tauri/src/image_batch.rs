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

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use tauri::{AppHandle, Manager};

use crate::error::AppError;
use crate::job_queue::{resolve_effective_scale, sanitize_job_id, Job};
use crate::job_state::JobState;
use crate::job_store::JobStore;
use crate::model_manager::get_models_dir;
use crate::process_runner::{ProcessHandle, ProcessRunner, StdProcessRunner};
use crate::sidecar_manager::resolve_sidecar_path;
use crate::video_pipeline::context::TempFolderGuard;

/// How many images one process may be given.
///
/// The cap is about blast radius, not throughput: everything in a group
/// shares one process, so a group that is killed outright (every member
/// cancelled) throws away that much work, and the startup cost being
/// amortised is already almost entirely recovered by the first handful of
/// images.
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
/// Tries a hard link first so a batch of large images does not have to be
/// duplicated on disk; falls back to a copy, which is what happens across
/// volumes and on filesystems that will not link.
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
fn produced_count(output_dir: &Path, member_count: usize) -> usize {
    (0..member_count)
        .take_while(|i| output_dir.join(format!("{}.png", member_stem(*i))).exists())
        .count()
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

fn build_args(job: &Job, dirs: &BatchDirs, app: &AppHandle) -> Vec<String> {
    let models_dir = get_models_dir(app);
    let gpu_vram_mb = crate::job_queue::get_gpu_vram_mb_for_id(app, job.gpu_id);
    let exec_profile = crate::engine::vram_governor::calculate_safe_execution_profile(
        gpu_vram_mb,
        job.tile_size,
        false,
    );
    let effective_scale = resolve_effective_scale(&job.model_name, job.scale, Some(&models_dir));

    vec![
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
        exec_profile.thread_arg.clone(),
        // Pin the output extension so the produced file name is derivable
        // from the staged one. build_output_path already settles on PNG for
        // every image job, so this is not a second opinion about format.
        "-f".to_string(),
        "png".to_string(),
        "-v".to_string(),
    ]
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

    let args = build_args(&members[0].job, &dirs, app);
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
    let mut stderr_log = String::new();

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
            return Ok(members.iter().map(|_| Err(AppError::Cancelled)).collect());
        }

        let current_pct = {
            let mut guard = shared_handle
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            let Some(ref mut child) = *guard else { break };
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

        let produced = produced_count(&dirs.output, members.len());
        let percentages = member_percentages(members.len(), produced, current_pct);

        for (index, member) in members.iter().enumerate() {
            if member.cancel_requested.load(Ordering::SeqCst) {
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
                Some(&format!(
                    "Batch upscaling ({} of {}) — {:.1}%",
                    (produced + 1).min(members.len()),
                    members.len(),
                    percentages[index]
                )),
                None,
                None,
            );
        }

        thread::sleep(POLL_INTERVAL);
    }

    Ok(collect_outcomes(members, &dirs.output, &stderr_log))
}

/// Decides each member's fate from what is actually on disk.
fn collect_outcomes(
    members: &[BatchMember],
    output_dir: &Path,
    stderr_log: &str,
) -> Vec<Result<(), AppError>> {
    members
        .iter()
        .enumerate()
        .map(|(index, member)| {
            let produced = output_dir.join(format!("{}.png", member_stem(index)));

            if member.cancel_requested.load(Ordering::SeqCst) {
                // The engine may well have produced this one before the
                // cancel landed. Discard it: a cancelled job must not leave
                // an output behind.
                let _ = fs::remove_file(&produced);
                return Err(AppError::Cancelled);
            }

            if !produced.exists() {
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
    fn test_a_member_is_never_reported_complete_before_its_file_exists() {
        // The engine's percentage is per-image and reaches 100 well before
        // the file is written, so it is clamped below 100 for the in-flight
        // member -- only the produced frontier can report completion.
        let pcts = member_percentages(2, 0, Some(100.0));
        assert!(pcts[0] < 100.0);
    }

    #[test]
    fn test_produced_count_stops_at_the_first_gap() {
        let dir = std::env::temp_dir().join("upscaly_produced_count");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();

        fs::write(dir.join("0000.png"), b"x").unwrap();
        fs::write(dir.join("0001.png"), b"x").unwrap();
        // A gap, then a later file: the frontier is contiguous, so this
        // must not be counted as three done.
        fs::write(dir.join("0003.png"), b"x").unwrap();

        assert_eq!(produced_count(&dir, 4), 2);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_cancelled_member_is_reported_cancelled_and_leaves_no_output() {
        let dir = std::env::temp_dir().join("upscaly_batch_outcomes");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("0000.png"), b"produced anyway").unwrap();

        let members = vec![BatchMember {
            job: image_job("a"),
            cancel_requested: Arc::new(AtomicBool::new(true)),
        }];

        let outcomes = collect_outcomes(&members, &dir, "");
        assert!(outcomes[0].as_ref().is_err_and(AppError::is_cancellation));
        // The engine can finish an image between the cancel landing and the
        // process stopping; that result must not survive.
        assert!(!dir.join("0000.png").exists());

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
        fs::write(dir.join("0000.png"), b"real output").unwrap();

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

        let outcomes = collect_outcomes(&members, &dir, "Engine exited with code 1: vk error");

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
