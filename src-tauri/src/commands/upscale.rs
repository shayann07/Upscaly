use crate::job_queue::{add_job_to_queue, cancel_job, Job};
use crate::UpscaleRequest;

#[tauri::command]
pub fn upscale_image(
    app_handle: tauri::AppHandle,
    request: UpscaleRequest,
) -> Result<String, String> {
    let job_id = request.job_id.unwrap_or_else(|| {
        use std::time::{SystemTime, UNIX_EPOCH};
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        format!("job_{:x}", nanos)
    });

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
pub async fn enqueue_job(app_handle: tauri::AppHandle, job: Job) -> Result<(), String> {
    add_job_to_queue(app_handle, job);
    Ok(())
}

#[tauri::command]
pub async fn cancel_active_job(app_handle: tauri::AppHandle, job_id: String) -> Result<(), String> {
    cancel_job(&app_handle, &job_id)
}
