pub mod app_paths;
pub mod commands;
pub mod engine;
pub mod error;
pub mod history;
pub mod image_batch;
pub mod job_queue;
pub mod job_state;
pub mod job_store;
mod model_manager;
pub mod output_paths;
pub mod process_runner;
mod settings;
mod sidecar_manager;
pub mod video_pipeline;

pub use error::AppError;
use sidecar_manager::kill_all_processes;

#[derive(Debug, serde::Deserialize, ts_rs::TS)]
#[ts(export, export_to = "../../src/lib/ipc/")]
pub struct UpscaleRequest {
    pub job_id: Option<String>,
    pub input_path: String,
    /// Where the user wants results written. `None`/empty means "alongside
    /// the input". The *file name* is not the caller's concern -- the backend
    /// owns naming and collision handling (see `output_paths`), and returns
    /// the path it settled on.
    pub output_dir: Option<String>,
    pub model_id: String,
    pub gpu_id: i32,
    pub scale: i32,
    pub tile_size: i32,
    pub is_video: bool,
    /// Absent for callers written before presets existed; those get
    /// [`QualityPreset::Balanced`], which behaves exactly as the engine did
    /// before this field.
    #[serde(default)]
    pub preset: engine::preset::QualityPreset,
    /// Container for the result. Images only; video is always MP4.
    #[serde(default)]
    pub output_format: engine::output_format::OutputFormat,
}

/// What `run_upscale` hands back: the job to track, and the path its output
/// is reserved at.
#[derive(Debug, serde::Serialize, ts_rs::TS)]
#[ts(export, export_to = "../../src/lib/ipc/")]
pub struct UpscaleJobHandle {
    pub job_id: String,
    pub output_path: String,
}

/// When the process entered [`run`] -- as close to launch as anything in
/// this process can observe. See `commands::window::launch_elapsed_ms` for
/// why the frontend needs this instead of its own clock.
static LAUNCHED_AT: std::sync::OnceLock<std::time::Instant> = std::sync::OnceLock::new();

pub(crate) fn launched_at() -> std::time::Instant {
    *LAUNCHED_AT.get_or_init(std::time::Instant::now)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    launched_at();
    tauri::Builder::default()
        // The window is created hidden (`visible: false` in the config)
        // and shown by the frontend via `show_main_window`, once the first
        // frame worth looking at -- splash or dashboard -- is painted.
        // Showing it from here on any earlier signal put the window on
        // screen before its contents: a flat fill before the first paint,
        // or a bare striped page while the splash played out invisibly.
        .setup(|app| {
            // Failsafe for the above. A window that is never shown is an
            // app the user cannot reach *and* cannot close, so a frontend
            // that dies before asking -- a failed navigation, a bundle
            // that throws at top level -- must not be able to strand it.
            // Better a late window over the wrong backdrop than none.
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(5));
                if let Some(window) = tauri::Manager::get_webview_window(&handle, "main") {
                    if !window.is_visible().unwrap_or(false) {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            });
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            commands::gpu::list_gpus,
            commands::gpu::get_vram_profile,
            commands::models::list_installed_models,
            commands::models::get_model_catalog,
            commands::models::download_model,
            commands::resume::list_resumable_jobs,
            commands::resume::resume_video_job,
            commands::resume::discard_resumable_job,
            commands::upscale::run_upscale_batch,
            commands::upscale::cancel_upscale,
            commands::upscale::get_jobs_snapshot,
            commands::settings::get_app_settings,
            commands::settings::update_app_settings,
            commands::settings::get_default_output_dir,
            commands::settings::get_history_entries,
            commands::telemetry::get_gpu_telemetry,
            commands::files::allow_media_path,
            commands::files::close_window,
            commands::files::minimize_window,
            commands::files::toggle_maximize_window,
            commands::files::get_file_size_bytes,
            commands::window::show_main_window,
            commands::window::launch_elapsed_ms,
            commands::window::is_debug_build
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
