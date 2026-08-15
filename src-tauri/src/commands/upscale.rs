use crate::job_queue::{add_job_to_queue, cancel_job, generate_job_id, sanitize_job_id, Job};
use crate::UpscaleRequest;

fn upscale_image(app_handle: tauri::AppHandle, request: UpscaleRequest) -> String {
    let job_id = request
        .job_id
        .map_or_else(generate_job_id, |id| sanitize_job_id(&id));

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
    job_id
}

#[tauri::command]
pub async fn run_upscale(
    app_handle: tauri::AppHandle,
    request: UpscaleRequest,
) -> Result<String, String> {
    Ok(upscale_image(app_handle, request))
}

#[tauri::command]
pub async fn cancel_upscale(app_handle: tauri::AppHandle, job_id: String) -> Result<(), String> {
    cancel_job(&app_handle, &job_id)
}
