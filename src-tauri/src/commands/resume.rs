use crate::error::AppError;
use crate::job_queue::add_jobs_to_queue;
use crate::output_paths::{ensure_output_dir, reserve_output_path};
use crate::video_pipeline::resume;
use crate::UpscaleJobHandle;

/// Crashed-but-recoverable video jobs found on disk.
///
/// Also the cleanup pass: folders that cannot be resumed are deleted during
/// the scan, so calling this on launch is what finally reclaims the temp
/// directories a crash used to leak forever.
#[tauri::command]
pub async fn list_resumable_jobs(
    app_handle: tauri::AppHandle,
) -> Result<Vec<resume::ResumableJob>, AppError> {
    Ok(resume::scan_resumable(&app_handle))
}

/// Continues a crashed video job from its completed frames.
///
/// The job is reconstructed from the on-disk manifest -- the frontend only
/// supplies the id, so nothing about the work to be done can be forged in
/// the request. The output path is re-reserved because reservations live in
/// process memory and did not survive the crash; if the name has since been
/// taken by another file, the reservation resolves a fresh one and the
/// store's snapshot carries it back to the UI.
#[tauri::command]
pub async fn resume_video_job(
    app_handle: tauri::AppHandle,
    job_id: String,
) -> Result<UpscaleJobHandle, AppError> {
    let mut job = resume::load_for_resume(&app_handle, &job_id)?;
    // The destination may still be the one that failed the original run --
    // a missing folder is the single most likely reason a job reached
    // reassembly and died there.
    ensure_output_dir(&job.output_path)?;
    job.output_path = reserve_output_path(&job.output_path);

    let handle = UpscaleJobHandle {
        job_id: job.id.clone(),
        output_path: job.output_path.clone(),
    };
    add_jobs_to_queue(app_handle, vec![job]);
    Ok(handle)
}

/// Deletes a resumable job's partial work at the user's explicit request.
#[tauri::command]
pub async fn discard_resumable_job(
    app_handle: tauri::AppHandle,
    job_id: String,
) -> Result<(), AppError> {
    resume::discard(&app_handle, &job_id)
}
