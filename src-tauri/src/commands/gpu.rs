#![cfg(feature = "desktop")]

use crate::engine::vram_governor::{build_vram_profile, VramProfile};
use crate::error::AppError;
use crate::job_queue::get_gpu_vram_mb_for_id;
use crate::sidecar_manager::{get_gpu_list, GpuDevice};

#[tauri::command]
pub async fn list_gpus(app_handle: tauri::AppHandle) -> Result<Vec<GpuDevice>, AppError> {
    get_gpu_list(&app_handle)
}

#[tauri::command]
pub async fn get_vram_profile(
    app_handle: tauri::AppHandle,
    gpu_id: i32,
    tile_size: i32,
    scale: i32,
) -> Result<VramProfile, AppError> {
    let gpu_vram_mb = get_gpu_vram_mb_for_id(&app_handle, gpu_id);
    // Scale is part of the question, not a detail: the same tile costs four
    // times as much at 4x as at 2x, so a profile computed without it can
    // report a comfortable projection for a configuration that will exhaust
    // the card.
    Ok(build_vram_profile(gpu_vram_mb, tile_size, scale))
}
