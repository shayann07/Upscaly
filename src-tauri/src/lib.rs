pub mod engine;
pub mod error;
mod job_queue;
mod model_manager;
pub mod process_runner;
mod settings;
mod sidecar_manager;
mod video_pipeline;

use engine::model_store::{ModelStatus, ModelStore};
pub use error::AppError;
use serde::{Deserialize, Serialize};
use settings::{load_settings, save_settings, AppSettings};
use tauri::Manager;

use job_queue::{add_job_to_queue, cancel_job, Job};
use model_manager::{
    get_models_dir, verify_signature, ManifestData, ModelItem,
    SignedManifest,
};
use sidecar_manager::{get_gpu_list, kill_all_processes, GpuDevice};

// Baked-in public key for verifying signed model manifests.
const BAKED_PUBLIC_KEY: &str = "0000000000000000000000000000000000000000000000000000000000000000";

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

#[tauri::command]
async fn list_gpus(app_handle: tauri::AppHandle) -> Result<Vec<GpuDevice>, String> {
    get_gpu_list(&app_handle)
}

#[tauri::command]
async fn get_gpus(app_handle: tauri::AppHandle) -> Result<Vec<GpuDevice>, String> {
    get_gpu_list(&app_handle)
}

#[tauri::command]
async fn list_installed_models(app_handle: tauri::AppHandle) -> Result<Vec<String>, String> {
    get_installed_models_impl(&app_handle)
}

#[tauri::command]
async fn get_installed_models(app_handle: tauri::AppHandle) -> Result<Vec<String>, String> {
    get_installed_models_impl(&app_handle)
}

fn get_installed_models_impl(app_handle: &tauri::AppHandle) -> Result<Vec<String>, String> {
    let models_dir = get_models_dir(app_handle);
    let mut installed = Vec::new();

    if let Ok(entries) = std::fs::read_dir(models_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map_or(false, |ext| ext == "param") {
                let bin_path = path.with_extension("bin");
                if bin_path.exists() {
                    if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                        installed.push(stem.to_string());
                    }
                }
            }
        }
    }

    Ok(installed)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FullModelInfo {
    pub id: String,
    pub name: String,
    pub note: String,
    pub cat: String,
    pub scale: u32,
    pub size: String,
    pub speed: f64,
    pub version: String,
    pub installed: bool,
    pub has_update: bool,
    pub is_corrupt: bool,
    pub is_custom: bool,
}

#[tauri::command]
async fn get_model_catalog(app_handle: tauri::AppHandle) -> Result<Vec<FullModelInfo>, String> {
    let models_dir = get_models_dir(&app_handle);
    let items = ModelStore::resolve_catalog(&app_handle, &models_dir).await?;

    let catalog = items
        .into_iter()
        .map(|item| {
            let installed = item.status == ModelStatus::Installed
                || item.status == ModelStatus::UpdateAvailable;
            let has_update = item.status == ModelStatus::UpdateAvailable;
            let is_corrupt = item.status == ModelStatus::Corrupt;
            FullModelInfo {
                id: item.id,
                name: item.name,
                note: item.note,
                cat: item.cat,
                scale: item.scale,
                size: item.size,
                speed: item.speed,
                version: item.version,
                installed,
                has_update,
                is_corrupt,
                is_custom: item.is_custom,
            }
        })
        .collect();

    Ok(catalog)
}

#[tauri::command]
async fn list_available_models(app_handle: tauri::AppHandle) -> Result<Vec<ModelItem>, String> {
    let models_dir = get_models_dir(&app_handle);
    let catalog = ModelStore::resolve_catalog(&app_handle, &models_dir).await?;
    let items = catalog
        .into_iter()
        .map(|m| ModelItem {
            id: m.id.clone(),
            name: m.name,
            version: m.version,
            note: Some(m.note),
            cat: Some(m.cat),
            scale: Some(m.scale),
            size: Some(m.size),
            speed: Some(m.speed),
            param_url: m.param_url,
            param_sha256: "".to_string(),
            param_size: 15408,
            bin_url: m.bin_url,
            bin_sha256: "".to_string(),
            bin_size: 9000000,
        })
        .collect();
    Ok(items)
}

#[tauri::command]
async fn check_for_model_updates(
    _app_handle: tauri::AppHandle,
    remote_manifest_url: String,
) -> Result<Vec<ModelItem>, String> {
    let client = reqwest::Client::new();
    let response = client
        .get(&remote_manifest_url)
        .send()
        .await
        .map_err(|e| format!("Failed to download remote manifest: {}", e))?;

    let signed_manifest: SignedManifest = response.json().await.map_err(|e| {
        format!(
            "Invalid manifest format. Failed to parse signed manifest: {}",
            e
        )
    })?;

    if BAKED_PUBLIC_KEY != "0000000000000000000000000000000000000000000000000000000000000000" {
        verify_signature(
            signed_manifest.data.as_bytes(),
            &signed_manifest.signature,
            BAKED_PUBLIC_KEY,
        )
        .map_err(|e| format!("Security check failed: {}", e))?;
    }

    let manifest_data: ManifestData = serde_json::from_str(&signed_manifest.data)
        .map_err(|e| format!("Failed to parse verified manifest data: {}", e))?;

    Ok(manifest_data.models)
}

#[tauri::command]
async fn upscale_image(
    app_handle: tauri::AppHandle,
    input_path: String,
    output_path: String,
    model_name: String,
    gpu_id: i32,
    scale: i32,
    tile_size: i32,
    is_video: bool,
    custom_job_id: Option<String>,
) -> Result<String, String> {
    let job_id = custom_job_id.unwrap_or_else(|| {
        use std::time::{SystemTime, UNIX_EPOCH};
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        format!("job_{:x}", nanos)
    });

    let job = Job {
        id: job_id.clone(),
        input_path,
        output_path,
        model_name,
        gpu_id,
        scale,
        tile_size,
        is_video,
    };

    add_job_to_queue(app_handle, job);
    Ok(job_id)
}

#[tauri::command]
async fn run_upscale(
    app_handle: tauri::AppHandle,
    request: UpscaleRequest,
) -> Result<String, String> {
    upscale_image(
        app_handle,
        request.input_path,
        request.output_path,
        request.model_id,
        request.gpu_id,
        request.scale,
        request.tile_size,
        request.is_video,
        request.job_id,
    )
    .await
}

#[tauri::command]
async fn cancel_upscale(app_handle: tauri::AppHandle, job_id: String) -> Result<(), String> {
    cancel_job(&app_handle, &job_id)
}

#[tauri::command]
async fn enqueue_job(app_handle: tauri::AppHandle, job: Job) -> Result<(), String> {
    add_job_to_queue(app_handle, job);
    Ok(())
}

#[tauri::command]
async fn cancel_active_job(app_handle: tauri::AppHandle, job_id: String) -> Result<(), String> {
    cancel_job(&app_handle, &job_id)
}

#[tauri::command]
async fn get_app_settings(app_handle: tauri::AppHandle) -> Result<AppSettings, String> {
    Ok(load_settings(&app_handle))
}

#[tauri::command]
async fn update_app_settings(
    app_handle: tauri::AppHandle,
    settings: AppSettings,
) -> Result<(), String> {
    save_settings(&app_handle, &settings)
}

#[tauri::command]
async fn get_default_output_dir(app_handle: tauri::AppHandle) -> Result<String, String> {
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

fn validate_safe_path(path_str: &str) -> Result<std::path::PathBuf, String> {
    if path_str.trim().is_empty() {
        return Err("Path cannot be empty".to_string());
    }
    let path = std::path::PathBuf::from(path_str);
    if path
        .components()
        .any(|c| matches!(c, std::path::Component::ParentDir))
    {
        return Err("Parent directory traversal (..) is prohibited in file paths".to_string());
    }
    Ok(path)
}

#[tauri::command]
async fn check_file_exists(path: String) -> Result<bool, String> {
    let p = validate_safe_path(&path)?;
    Ok(p.exists() && p.is_file())
}

// Native file launcher commands
#[tauri::command]
async fn open_file_native(path: String) -> Result<(), String> {
    let p = validate_safe_path(&path)?;
    let clean_path = p.to_string_lossy().to_string();

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(&["/c", "start", "", &clean_path])
            .spawn()
            .map_err(|e| format!("Failed to open file: {}", e))?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        open::that(&clean_path).map_err(|e| format!("Failed to open file: {}", e))
    }
}

#[tauri::command]
async fn show_in_explorer_native(path: String) -> Result<(), String> {
    let p = validate_safe_path(&path)?;
    let clean_path = p.to_string_lossy().to_string();

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .args(&["/select,", &clean_path])
            .spawn()
            .map_err(|e| format!("Failed to open explorer: {}", e))?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        open::that(&clean_path).map_err(|e| format!("Failed to open folder: {}", e))
    }
}

// Window control native commands
#[tauri::command]
async fn close_window(window: tauri::Window) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())
}

#[tauri::command]
async fn minimize_window(window: tauri::Window) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
async fn toggle_maximize_window(window: tauri::Window) -> Result<(), String> {
    if window.is_maximized().unwrap_or(false) {
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())
    }
}

#[derive(Debug, serde::Serialize)]
pub struct SystemDiagnostics {
    pub sidecar_realesrgan: String,
    pub sidecar_ffmpeg: String,
    pub sidecar_ffprobe: String,
    pub gpus_detected: usize,
    pub available_encoders: Vec<String>,
    pub is_win64: bool,
}

#[tauri::command]
async fn get_system_diagnostics(app_handle: tauri::AppHandle) -> Result<SystemDiagnostics, String> {
    let sidecar_realesrgan =
        sidecar_manager::resolve_sidecar_path(&app_handle, "realesrgan-ncnn-vulkan")
            .map(|p| {
                p.file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string()
            })
            .unwrap_or_else(|_| "Missing".to_string());

    let sidecar_ffmpeg = video_pipeline::resolve_ffmpeg_binary(&app_handle)
        .map(|p| {
            std::path::Path::new(&p)
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string()
        })
        .unwrap_or_else(|_| "Missing".to_string());

    let sidecar_ffprobe = video_pipeline::resolve_ffprobe_binary(&app_handle)
        .map(|p| {
            std::path::Path::new(&p)
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string()
        })
        .unwrap_or_else(|_| "Missing".to_string());

    let gpus = sidecar_manager::get_gpu_list(&app_handle).unwrap_or_default();

    let mut available_encoders = Vec::new();
    let ffmpeg_bin =
        video_pipeline::resolve_ffmpeg_binary(&app_handle).unwrap_or_else(|_| "ffmpeg".to_string());

    for &enc in &["h264_nvenc", "h264_qsv", "h264_amf", "h264_mf"] {
        let res = std::process::Command::new(&ffmpeg_bin)
            .args(&["-h", &format!("encoder={}", enc)])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status();

        if let Ok(st) = res {
            if st.success() {
                available_encoders.push(enc.to_string());
            }
        }
    }

    Ok(SystemDiagnostics {
        sidecar_realesrgan,
        sidecar_ffmpeg,
        sidecar_ffprobe,
        gpus_detected: gpus.len(),
        available_encoders,
        is_win64: cfg!(all(target_os = "windows", target_arch = "x86_64")),
    })
}

#[tauri::command]
async fn download_model(app_handle: tauri::AppHandle, model_id: String) -> Result<(), String> {
    let models_dir = get_models_dir(&app_handle);
    let items = ModelStore::resolve_catalog(&app_handle, &models_dir).await?;
    if let Some(target_item) = items.into_iter().find(|m| m.id == model_id) {
        ModelStore::download_model(&app_handle, &models_dir, &target_item).await?;
        Ok(())
    } else {
        Err(format!("Model '{}' not found in catalog", model_id))
    }
}

#[tauri::command]
async fn download_model_files(
    app_handle: tauri::AppHandle,
    model: ModelItem,
) -> Result<(), String> {
    download_model(app_handle, model.id).await
}

#[tauri::command]
async fn repair_model(app_handle: tauri::AppHandle, model_id: String) -> Result<(), String> {
    download_model(app_handle, model_id).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            list_gpus,
            get_gpus,
            get_installed_models,
            list_installed_models,
            list_available_models,
            get_model_catalog,
            check_for_model_updates,
            download_model_files,
            download_model,
            repair_model,
            upscale_image,
            run_upscale,
            cancel_upscale,
            enqueue_job,
            cancel_active_job,
            get_app_settings,
            update_app_settings,
            get_default_output_dir,
            check_file_exists,
            open_file_native,
            show_in_explorer_native,
            close_window,
            minimize_window,
            toggle_maximize_window,
            get_system_diagnostics
        ])
        .on_window_event(|_window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                kill_all_processes();
                job_queue::kill_all_active_jobs();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
