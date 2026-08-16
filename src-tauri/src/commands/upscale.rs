use crate::error::AppError;
use crate::job_queue::{
    add_jobs_to_queue, cancel_job, generate_job_id, resolve_effective_scale, sanitize_job_id, Job,
};
use crate::job_store::{JobSnapshot, JobStore};
use crate::model_manager::get_models_dir;
use crate::output_paths::{build_output_path, reserve_output_path};
use crate::{UpscaleJobHandle, UpscaleRequest};

fn build_job(app_handle: &tauri::AppHandle, request: UpscaleRequest) -> (Job, UpscaleJobHandle) {
    let job_id = request
        .job_id
        .map_or_else(generate_job_id, |id| sanitize_job_id(&id));

    // Name the file after the factor the engine will actually deliver, not
    // the one that was asked for. Models are fixed-factor: requesting 2x
    // from a 4x model produces a 4x image, and naming it "_upscaled_2x"
    // made the file itself state something untrue about its own contents.
    let models_dir = get_models_dir(app_handle);
    let effective_scale =
        resolve_effective_scale(&request.model_id, request.scale, Some(&models_dir));

    // Name and reserve here rather than trusting a caller-supplied path, so
    // there is exactly one implementation of how an output is named and
    // exactly one place that guarantees two jobs cannot claim the same file.
    let desired = build_output_path(
        &request.input_path,
        request.is_video,
        effective_scale.max(0).cast_unsigned(),
        request.output_dir.as_deref(),
        request.output_format,
    );
    let output_path = reserve_output_path(&desired);

    let job = Job {
        id: job_id.clone(),
        input_path: request.input_path,
        output_path: output_path.clone(),
        model_name: request.model_id,
        gpu_id: request.gpu_id,
        scale: request.scale,
        tile_size: request.tile_size,
        is_video: request.is_video,
        preset: request.preset,
        output_format: request.output_format,
        // Fresh submissions never resume; only the resume command sets this,
        // and it reconstructs the Job from the on-disk manifest instead of
        // trusting a request field.
        resume: false,
    };

    (
        job,
        UpscaleJobHandle {
            job_id,
            output_path,
        },
    )
}

/// Submits a whole run at once and reports where each result will land.
///
/// One command for one file or twenty. Submitting them one call at a time
/// would also work, but the queue starts the first job the instant it is
/// enqueued, so nothing after it would ever arrive in time to share a
/// process -- and sharing one process across compatible images is where the
/// batch speedup comes from. Handles come back in the order they were sent.
#[tauri::command]
pub async fn run_upscale_batch(
    app_handle: tauri::AppHandle,
    requests: Vec<UpscaleRequest>,
) -> Result<Vec<UpscaleJobHandle>, AppError> {
    let (jobs, handles): (Vec<Job>, Vec<UpscaleJobHandle>) = requests
        .into_iter()
        .map(|r| build_job(&app_handle, r))
        .unzip();

    add_jobs_to_queue(app_handle, jobs);
    Ok(handles)
}

#[tauri::command]
pub async fn cancel_upscale(app_handle: tauri::AppHandle, job_id: String) -> Result<(), AppError> {
    cancel_job(&app_handle, &job_id)
}

/// Every job the backend knows about, with its current state.
///
/// The frontend used to have no way to ask this: the queue only emitted
/// per-tick progress events, so "what is running right now" had to be
/// accumulated from that stream and was lost on reload, or on any event that
/// arrived before a listener was attached. Reading state beats rebuilding it.
#[tauri::command]
pub async fn get_jobs_snapshot() -> Vec<JobSnapshot> {
    JobStore::global().snapshot()
}
