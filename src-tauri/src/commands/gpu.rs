use crate::sidecar_manager::{get_gpu_list, GpuDevice};

#[tauri::command]
pub async fn list_gpus(app_handle: tauri::AppHandle) -> Result<Vec<GpuDevice>, String> {
    get_gpu_list(&app_handle)
}

#[tauri::command]
pub async fn get_gpus(app_handle: tauri::AppHandle) -> Result<Vec<GpuDevice>, String> {
    get_gpu_list(&app_handle)
}
