//! Crash recovery for video jobs.
//!
//! A video upscale is hours of GPU work accumulating as individual PNG
//! frames in a temp directory, and until this module existed a crash at 95%
//! discarded all of it -- the work was on disk, complete and usable, and the
//! app simply wiped it on the next run's `VideoJobContext::new`.
//!
//! The mechanism is deliberately dumb:
//!
//! * At job start, the full [`Job`] is serialised to `job.json` inside the
//!   job's temp directory. That file is the marker that the folder is a
//!   resumable work-in-progress rather than debris.
//! * A crash -- process kill, power loss, GPU hang taking the machine down --
//!   never runs the `TempFolderGuard`, so the folder and manifest survive by
//!   default. Nothing has to detect the crash as it happens, which is the
//!   only strategy that works for the failure modes that matter here.
//! * On the next launch the frontend asks [`scan_resumable`] what survived.
//!   Each candidate is validated against the present, not the past: the
//!   input file must still exist and the completed-frame count is taken by
//!   verifying frames on disk, not from any recorded progress figure.
//! * Resuming re-runs the same `Job` with [`Job::resume`] set. The context
//!   keeps `frames_out` instead of wiping it, extraction re-runs from the
//!   source (cheap, CPU-bound, deterministic names), and `stage_next_batch`
//!   discards any staged frame whose upscaled output already exists -- so
//!   the expensive GPU work is done exactly once per frame across any
//!   number of attempts.
//!
//! Folders that cannot be resumed -- no manifest (predates this module), a
//! deleted input, zero completed frames -- are removed by the same scan.
//! Every path deleted here is re-derived under the cache directory from a
//! sanitised id, never taken from the manifest, so a tampered `job.json`
//! cannot aim the recursive delete anywhere else.

use std::fs;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

use crate::engine::output_format::OutputFormat;
use crate::error::AppError;
use crate::image_batch::is_complete_image;
use crate::job_queue::{sanitize_job_id, Job};

pub const MANIFEST_FILE: &str = "job.json";
const JOB_DIR_PREFIX: &str = "upscaler_job_";

/// What the frontend needs to render a "resume this?" card.
#[derive(Debug, Clone, serde::Serialize, ts_rs::TS)]
#[ts(export, export_to = "../../src/lib/ipc/")]
pub struct ResumableJob {
    pub job_id: String,
    pub file_name: String,
    pub input_path: String,
    pub output_path: String,
    pub model_name: String,
    pub scale: i32,
    /// Frames verified complete on disk -- counted, not recalled.
    #[ts(type = "number")]
    pub frames_done: u64,
}

/// Records the job into its temp directory so a crashed run can be
/// identified and reconstructed later. Failure is deliberately non-fatal:
/// a job that cannot write its manifest still runs, it just cannot be
/// resumed -- strictly no worse than before this module existed.
pub fn write_manifest(job_temp_dir: &Path, job: &Job) {
    if let Ok(json) = serde_json::to_string_pretty(job) {
        let _ = fs::write(job_temp_dir.join(MANIFEST_FILE), json);
    }
}

fn cache_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .app_cache_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
}

/// The temp directory for a job id, re-derived from the sanitised id.
///
/// This is the only way any function in this module builds a deletable
/// path. The manifest's own contents never become one.
fn job_dir_for(app: &AppHandle, job_id: &str) -> Result<PathBuf, AppError> {
    let cache = cache_dir(app);
    let dir = cache.join(format!("{JOB_DIR_PREFIX}{}", sanitize_job_id(job_id)));
    if dir.parent() != Some(cache.as_path()) {
        return Err(AppError::exec(
            "Invalid job id: refusing to build an unsafe temp path",
        ));
    }
    Ok(dir)
}

/// Counts completed output frames, deleting any partial one found.
///
/// A crash can land mid-write, leaving a truncated PNG as the newest
/// output. Deleting partials here -- at scan time and again just before a
/// resume runs -- is what lets the rest of the pipeline treat "exists in
/// `frames_out`" as "finished", including the cheap existence check in
/// `stage_next_batch`.
pub fn verified_frame_count(frames_out: &Path) -> u64 {
    let Ok(entries) = fs::read_dir(frames_out) else {
        return 0;
    };
    let mut complete = 0u64;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path
            .extension()
            .is_some_and(|e| e.eq_ignore_ascii_case("png"))
        {
            continue;
        }
        if is_complete_image(&path, OutputFormat::Png) {
            complete += 1;
        } else {
            let _ = fs::remove_file(&path);
        }
    }
    complete
}

/// Everything in the cache directory worth offering to resume.
///
/// Folders that cannot be resumed are deleted here rather than reported:
/// a job directory with no manifest, no surviving frames, or an input file
/// that no longer exists is debris from a crash, and this scan is the
/// cleanup path the leak previously never had.
pub fn scan_resumable(app: &AppHandle) -> Vec<ResumableJob> {
    let cache = cache_dir(app);
    let Ok(entries) = fs::read_dir(&cache) else {
        return Vec::new();
    };

    let mut found = Vec::new();
    for entry in entries.flatten() {
        let dir = entry.path();
        let Some(name) = dir.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if !dir.is_dir() || !name.starts_with(JOB_DIR_PREFIX) {
            continue;
        }

        let manifest = dir.join(MANIFEST_FILE);
        let job: Option<Job> = fs::read_to_string(&manifest)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok());

        let resumable = job.and_then(|job| {
            if !job.is_video || !Path::new(&job.input_path).is_file() {
                return None;
            }
            let frames_done = verified_frame_count(&dir.join("frames_out"));
            if frames_done == 0 {
                return None;
            }
            let file_name = Path::new(&job.input_path)
                .file_name()
                .map_or_else(|| job.input_path.clone(), |n| n.to_string_lossy().into());
            Some(ResumableJob {
                job_id: job.id,
                file_name,
                input_path: job.input_path,
                output_path: job.output_path,
                model_name: job.model_name,
                scale: job.scale,
                frames_done,
            })
        });

        match resumable {
            Some(r) => found.push(r),
            // Not resumable: debris. This folder is a direct child of the
            // cache dir matching our prefix, so removing it is exactly the
            // cleanup the crash skipped.
            None => {
                let _ = fs::remove_dir_all(&dir);
            }
        }
    }
    found
}

/// Reconstructs the [`Job`] for a resume, marked so the context preserves
/// completed frames. The manifest is re-read rather than trusting anything
/// the frontend sends beyond the id.
pub fn load_for_resume(app: &AppHandle, job_id: &str) -> Result<Job, AppError> {
    let dir = job_dir_for(app, job_id)?;
    let manifest = dir.join(MANIFEST_FILE);
    let text = fs::read_to_string(&manifest)
        .map_err(|_| AppError::exec("This job can no longer be resumed (manifest missing)."))?;
    let mut job: Job = serde_json::from_str(&text)
        .map_err(|_| AppError::exec("This job can no longer be resumed (manifest unreadable)."))?;
    if !Path::new(&job.input_path).is_file() {
        return Err(AppError::exec(
            "The original video no longer exists at its recorded path.",
        ));
    }
    job.resume = true;
    Ok(job)
}

/// Deletes a resumable job's folder on the user's explicit request.
pub fn discard(app: &AppHandle, job_id: &str) -> Result<(), AppError> {
    let dir = job_dir_for(app, job_id)?;
    if dir.exists() {
        fs::remove_dir_all(&dir)
            .map_err(|e| AppError::exec(format!("Failed to delete partial work: {e}")))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(name);
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    const IEND: [u8; 12] = [
        0x00, 0x00, 0x00, 0x00, b'I', b'E', b'N', b'D', 0xAE, 0x42, 0x60, 0x82,
    ];

    fn write_complete(path: &Path) {
        let mut bytes = b"\x89PNG\r\n\x1a\n....pixels....".to_vec();
        bytes.extend_from_slice(&IEND);
        fs::write(path, bytes).unwrap();
    }

    #[test]
    fn test_verified_count_counts_complete_and_removes_partials() {
        // The newest frame at crash time is routinely truncated. Counting
        // it as done would make resume skip a frame the video then lacks;
        // leaving it on disk would make the existence check in
        // stage_next_batch treat it as finished. Deleting it is the only
        // option that keeps "exists" meaning "complete".
        let dir = temp_dir("upscaly_resume_verify");
        write_complete(&dir.join("frame_00000001.png"));
        write_complete(&dir.join("frame_00000002.png"));
        fs::write(dir.join("frame_00000003.png"), b"\x89PNG truncated mid-wr").unwrap();

        assert_eq!(verified_frame_count(&dir), 2);
        assert!(!dir.join("frame_00000003.png").exists());
        // Idempotent: a second scan finds the same two.
        assert_eq!(verified_frame_count(&dir), 2);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_verified_count_of_missing_dir_is_zero() {
        assert_eq!(verified_frame_count(Path::new("Z:\\does\\not\\exist")), 0);
    }
}
