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

use tauri::Manager;

fn fatal_dialog(message: &str) {
    #[cfg(windows)]
    #[allow(unsafe_code)]
    unsafe {
        use windows_sys::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONERROR};
        let msg: Vec<u16> = message.encode_utf16().chain(std::iter::once(0)).collect();
        let title: Vec<u16> = "Upscaly Studio"
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect();
        MessageBoxW(0, msg.as_ptr(), title.as_ptr(), MB_ICONERROR);
    }
    #[cfg(not(windows))]
    eprintln!("FATAL: {message}");
}

fn sweep_old_logs(log_dir: &std::path::Path) {
    if let Ok(entries) = std::fs::read_dir(log_dir) {
        let cutoff = std::time::SystemTime::now()
            .checked_sub(std::time::Duration::from_hours(14 * 24))
            .unwrap_or(std::time::SystemTime::UNIX_EPOCH);
        for entry in entries.flatten() {
            if let Ok(meta) = entry.metadata() {
                if let Ok(modified) = meta.modified() {
                    if modified < cutoff {
                        let _ = std::fs::remove_file(entry.path());
                    }
                }
            }
        }
    }
}

fn init_logging(app: &mut tauri::App) {
    let log_dir = crate::app_paths::app_data_dir(app.handle()).join("logs");
    let _ = std::fs::create_dir_all(&log_dir);
    sweep_old_logs(&log_dir);

    let appender = tracing_appender::rolling::daily(&log_dir, "upscaly.log");
    let (writer, guard) = tracing_appender::non_blocking(appender);
    // The guard must outlive the process or buffered lines are lost.
    app.manage(guard);
    let _ = tracing_subscriber::fmt()
        .with_writer(writer)
        .with_ansi(false)
        .try_init();
    tracing::info!(version = env!("CARGO_PKG_VERSION"), "upscaly starting");
}

fn spawn_visibility_failsafe(handle: tauri::AppHandle) {
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(5));
        if let Some(window) = tauri::Manager::get_webview_window(&handle, "main") {
            if !window.is_visible().unwrap_or(false) {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
        std::thread::sleep(std::time::Duration::from_secs(15));
        if !crate::commands::window::FRONTEND_SHOWED.load(std::sync::atomic::Ordering::SeqCst) {
            if let Some(window) = tauri::Manager::get_webview_window(&handle, "main") {
                let _ = window.set_decorations(true);
            }
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    launched_at();

    std::panic::set_hook(Box::new(|info| {
        fatal_dialog(&format!(
            "Upscaly Studio crashed during startup:\n\n{info}\n\nPlease report this."
        ));
    }));

    let builder = tauri::Builder::default()
        // The window is created hidden (`visible: false` in the config)
        // and shown by the frontend via `show_main_window`, once the first
        // frame worth looking at -- splash or dashboard -- is painted.
        // Showing it from here on any earlier signal put the window on
        // screen before its contents: a flat fill before the first paint,
        // or a bare striped page while the splash played out invisibly.
        .setup(|app| {
            init_logging(app);
            spawn_visibility_failsafe(app.handle().clone());
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
            commands::window::is_debug_build,
            commands::sidecars::provision_ffmpeg,
            commands::sidecars::ffmpeg_available
        ])
        .on_window_event(|_window, event| {
            if matches!(
                event,
                tauri::WindowEvent::CloseRequested { .. } | tauri::WindowEvent::Destroyed
            ) {
                kill_all_processes();
                job_queue::kill_all_active_jobs();
            }
        });

    let app = match builder.build(tauri::generate_context!()) {
        Ok(app) => app,
        Err(e) => {
            fatal_dialog(&format!(
                "Upscaly Studio failed to start:\n\n{e}\n\nThis usually means the Microsoft Edge \
                 WebView2 Runtime is missing or damaged. Reinstalling the app repairs it."
            ));
            std::process::exit(1);
        }
    };

    app.run(|_app_handle, event| {
        if matches!(
            event,
            tauri::RunEvent::Exit | tauri::RunEvent::ExitRequested { .. }
        ) {
            kill_all_processes();
            job_queue::kill_all_active_jobs();
        }
    });
}
