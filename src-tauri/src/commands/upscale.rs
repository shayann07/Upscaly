use crate::job_queue::{add_job_to_queue, cancel_job, generate_job_id, sanitize_job_id, Job};
use crate::output_paths::{build_output_path, reserve_output_path};
use crate::{UpscaleJobHandle, UpscaleRequest};

fn upscale_image(app_handle: tauri::AppHandle, request: UpscaleRequest) -> UpscaleJobHandle {
    let job_id = request
        .job_id
        .map_or_else(generate_job_id, |id| sanitize_job_id(&id));

    // Name and reserve here rather than trusting a caller-supplied path, so
    // there is exactly one implementation of how an output is named and
    // exactly one place that guarantees two jobs cannot claim the same file.
    let desired = build_output_path(
        &request.input_path,
        request.is_video,
        request.scale.max(0).cast_unsigned(),
        request.output_dir.as_deref(),
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
    };

    add_job_to_queue(app_handle, job);
    UpscaleJobHandle {
        job_id,
        output_path,
    }
}

#[tauri::command]
pub async fn run_upscale(
    app_handle: tauri::AppHandle,
    request: UpscaleRequest,
) -> Result<UpscaleJobHandle, String> {
    Ok(upscale_image(app_handle, request))
}

#[tauri::command]
pub async fn cancel_upscale(app_handle: tauri::AppHandle, job_id: String) -> Result<(), String> {
    cancel_job(&app_handle, &job_id)
}
