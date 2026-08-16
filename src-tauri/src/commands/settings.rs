use crate::error::AppError;
use crate::history::HistoryRecord;
use crate::settings::{load_settings, save_settings, AppSettings};
use tauri::Manager;

#[tauri::command]
pub async fn get_app_settings(app_handle: tauri::AppHandle) -> Result<AppSettings, String> {
    Ok(load_settings(&app_handle))
}

#[tauri::command]
pub async fn update_app_settings(
    app_handle: tauri::AppHandle,
    settings: AppSettings,
) -> Result<(), String> {
    save_settings(&app_handle, &settings)
}

#[tauri::command]
pub async fn get_default_output_dir(app_handle: tauri::AppHandle) -> Result<String, String> {
    use tauri::path::BaseDirectory;
    let pic_dir = app_handle
        .path()
        .resolve("Upscaled", BaseDirectory::Picture)
        .or_else(|_| {
            app_handle
                .path()
                .resolve("Upscaled", BaseDirectory::Download)
        })
        .unwrap_or_else(|_| std::path::PathBuf::from("Upscaled"));
    let _ = std::fs::create_dir_all(&pic_dir);
    Ok(pic_dir.to_string_lossy().to_string())
}

/// The backend's durable completion history, newest first. See
/// `crate::history` for why this exists alongside the frontend's own copy.
#[tauri::command]
pub async fn get_history_entries(
    app_handle: tauri::AppHandle,
) -> Result<Vec<HistoryRecord>, AppError> {
    Ok(crate::history::load(&app_handle))
}
