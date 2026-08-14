use crate::job_queue::{add_job_to_queue, cancel_job, generate_job_id, sanitize_job_id, Job};
use crate::UpscaleRequest;

#[tauri::command]
pub fn upscale_image(
    app_handle: tauri::AppHandle,
    request: UpscaleRequest,
) -> Result<String, String> {
    let job_id = request
        .job_id
        .map(|id| sanitize_job_id(&id))
        .unwrap_or_else(generate_job_id);

    let job = Job {
        id: job_id.clone(),
        input_path: request.input_path,
        output_path: request.output_path,
        model_name: request.model_id,
        gpu_id: request.gpu_id,
        scale: request.scale,
        tile_size: request.tile_size,
        is_video: request.is_video,
    };

    add_job_to_queue(app_handle, job);
    Ok(job_id)
}

#[tauri::command]
pub async fn run_upscale(
    app_handle: tauri::AppHandle,
    request: UpscaleRequest,
) -> Result<String, String> {
    upscale_image(app_handle, request)
}

#[tauri::command]
pub async fn cancel_upscale(app_handle: tauri::AppHandle, job_id: String) -> Result<(), String> {
    cancel_job(&app_handle, &job_id)
}

#[tauri::command]
pub async fn enqueue_job(app_handle: tauri::AppHandle, mut job: Job) -> Result<(), String> {
    job.id = sanitize_job_id(&job.id);
    add_job_to_queue(app_handle, job);
    Ok(())
}

#[tauri::command]
pub async fn cancel_active_job(app_handle: tauri::AppHandle, job_id: String) -> Result<(), String> {
    cancel_job(&app_handle, &job_id)
}
