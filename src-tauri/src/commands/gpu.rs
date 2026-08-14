use crate::engine::vram_governor::{build_vram_profile, VramProfile};
use crate::job_queue::get_gpu_vram_mb_for_id;
use crate::sidecar_manager::{get_gpu_list, GpuDevice};

#[tauri::command]
pub async fn list_gpus(app_handle: tauri::AppHandle) -> Result<Vec<GpuDevice>, String> {
    get_gpu_list(&app_handle)
}

#[tauri::command]
pub async fn get_gpus(app_handle: tauri::AppHandle) -> Result<Vec<GpuDevice>, String> {
    get_gpu_list(&app_handle)
}

#[tauri::command]
pub async fn get_vram_profile(
    app_handle: tauri::AppHandle,
    gpu_id: i32,
    tile_size: i32,
) -> Result<VramProfile, String> {
    let gpu_vram_mb = get_gpu_vram_mb_for_id(&app_handle, gpu_id);
    Ok(build_vram_profile(gpu_vram_mb, tile_size))
}
