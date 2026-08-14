#![allow(clippy::all, clippy::pedantic, clippy::nursery, clippy::cargo)]

pub mod commands;
pub mod engine;
pub mod error;
pub mod job_queue;
pub mod job_state;
mod model_manager;
pub mod output_paths;
pub mod process_runner;
mod settings;
mod sidecar_manager;
pub mod video_pipeline;

pub use error::AppError;
use sidecar_manager::kill_all_processes;

#[derive(Debug, serde::Deserialize)]
pub struct UpscaleRequest {
    pub job_id: Option<String>,
    pub input_path: String,
    pub output_path: String,
    pub model_id: String,
    pub gpu_id: i32,
    pub scale: i32,
    pub tile_size: i32,
    pub is_video: bool,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::gpu::list_gpus,
            commands::gpu::get_gpus,
            commands::gpu::get_vram_profile,
            commands::models::get_installed_models,
            commands::models::list_installed_models,
            commands::models::list_available_models,
            commands::models::get_model_catalog,
            commands::models::check_for_model_updates,
            commands::models::download_model_files,
            commands::models::download_model,
            commands::models::repair_model,
            commands::upscale::upscale_image,
            commands::upscale::run_upscale,
            commands::upscale::cancel_upscale,
            commands::upscale::enqueue_job,
            commands::upscale::cancel_active_job,
            commands::settings::get_app_settings,
            commands::settings::update_app_settings,
            commands::settings::get_default_output_dir,
            commands::files::check_file_exists,
            commands::files::open_file_native,
            commands::files::show_in_explorer_native,
            commands::files::close_window,
            commands::files::minimize_window,
            commands::files::toggle_maximize_window,
            commands::files::get_file_size_bytes,
            commands::diagnostics::get_system_diagnostics
        ])
        .on_window_event(|_window, event| {
            if matches!(
                event,
                tauri::WindowEvent::CloseRequested { .. } | tauri::WindowEvent::Destroyed
            ) {
                kill_all_processes();
                job_queue::kill_all_active_jobs();
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, event| {
            if matches!(
                event,
                tauri::RunEvent::Exit | tauri::RunEvent::ExitRequested { .. }
            ) {
                kill_all_processes();
                job_queue::kill_all_active_jobs();
            }
        });
}
