pub mod error;
mod sidecar_manager;
mod model_manager;
mod job_queue;
mod video_pipeline;
mod settings;

pub use error::AppError;
use settings::{AppSettings, load_settings, save_settings};

use sidecar_manager::{GpuDevice, get_gpu_list, kill_all_processes};
use model_manager::{ModelItem, SignedManifest, ManifestData, verify_signature, get_models_dir, calculate_sha256, get_available_disk_space};
use job_queue::{Job, add_job_to_queue, cancel_job};

// Baked-in public key for verifying signed model manifests.
const BAKED_PUBLIC_KEY: &str = "0000000000000000000000000000000000000000000000000000000000000000";

#[derive(Debug, serde::Deserialize)]
struct UpscaleRequest {
    input_path: String,
    output_path: String,
    model_id: String,
    gpu_id: i32,
    scale: i32,
    tile_size: i32,
    is_video: bool,
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

#[tauri::command]
async fn list_available_models(_app_handle: tauri::AppHandle) -> Result<Vec<ModelItem>, String> {
    Ok(vec![
        ModelItem {
            id: "realesrgan-x4plus".to_string(),
            name: "RealESRGAN Ultra".to_string(),
            version: "v0.2.5".to_string(),
            param_url: "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-x4plus.param".to_string(),
            param_sha256: "".to_string(),
            param_size: 15408,
            bin_url: "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-x4plus.bin".to_string(),
            bin_sha256: "".to_string(),
            bin_size: 67000000,
        },
        ModelItem {
            id: "realesrgan-x4plus-anime".to_string(),
            name: "RealESRGAN Anime Art".to_string(),
            version: "v0.2.5".to_string(),
            param_url: "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-x4plus-anime.param".to_string(),
            param_sha256: "".to_string(),
            param_size: 15408,
            bin_url: "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-x4plus-anime.bin".to_string(),
            bin_sha256: "".to_string(),
            bin_size: 17000000,
        },
        ModelItem {
            id: "realesr-animevideov3-x2".to_string(),
            name: "Anime & 2D Art (2x)".to_string(),
            version: "v0.2.5".to_string(),
            param_url: "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesr-animevideov3-x2.param".to_string(),
            param_sha256: "".to_string(),
            param_size: 15408,
            bin_url: "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesr-animevideov3-x2.bin".to_string(),
            bin_sha256: "".to_string(),
            bin_size: 9000000,
        },
        ModelItem {
            id: "realesr-animevideov3-x3".to_string(),
            name: "Anime & 2D Art (3x)".to_string(),
            version: "v0.2.5".to_string(),
            param_url: "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesr-animevideov3-x3.param".to_string(),
            param_sha256: "".to_string(),
            param_size: 15408,
            bin_url: "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesr-animevideov3-x3.bin".to_string(),
            bin_sha256: "".to_string(),
            bin_size: 9000000,
        },
        ModelItem {
            id: "realesr-animevideov3-x4".to_string(),
            name: "Anime & 2D Art (4x)".to_string(),
            version: "v0.2.5".to_string(),
            param_url: "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesr-animevideov3-x4.param".to_string(),
            param_sha256: "".to_string(),
            param_size: 15408,
            bin_url: "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesr-animevideov3-x4.bin".to_string(),
            bin_sha256: "".to_string(),
            bin_size: 9000000,
        },
    ])
}

#[tauri::command]
async fn check_for_model_updates(_app_handle: tauri::AppHandle, remote_manifest_url: String) -> Result<Vec<ModelItem>, String> {
    let client = reqwest::Client::new();
    let response = client.get(&remote_manifest_url)
        .send()
        .await
        .map_err(|e| format!("Failed to download remote manifest: {}", e))?;

    let signed_manifest: SignedManifest = response.json()
        .await
        .map_err(|e| format!("Invalid manifest format. Failed to parse signed manifest: {}", e))?;

    verify_signature(
        signed_manifest.data.as_bytes(),
        &signed_manifest.signature,
        BAKED_PUBLIC_KEY,
    ).map_err(|e| format!("Security check failed: {}", e))?;

    let manifest_data: ManifestData = serde_json::from_str(&signed_manifest.data)
        .map_err(|e| format!("Failed to parse verified manifest data: {}", e))?;

    Ok(manifest_data.models)
}

#[tauri::command]
async fn download_model_files(
    app_handle: tauri::AppHandle,
    model: ModelItem,
) -> Result<(), String> {
    let models_dir = get_models_dir(&app_handle);
    let total_size = model.param_size + model.bin_size;

    if total_size > 0 {
        let free_space = get_available_disk_space(&models_dir)?;
        if free_space < total_size + 50 * 1024 * 1024 {
            return Err("Insufficient disk space on destination drive".to_string());
        }
    }

    let param_path = models_dir.join(format!("{}.param", model.id));
    let bin_path = models_dir.join(format!("{}.bin", model.id));

    model_manager::download_file(
        &app_handle,
        &model.id,
        "param",
        &model.param_url,
        &param_path,
        model.param_size,
    ).await?;

    if !model.param_sha256.is_empty() {
        let param_hash = calculate_sha256(&param_path.with_extension("tmp"))?;
        if param_hash != model.param_sha256 {
            let _ = std::fs::remove_file(&param_path.with_extension("tmp"));
            return Err("SHA-256 validation failed for param file".to_string());
        }
    }
    std::fs::rename(param_path.with_extension("tmp"), &param_path)
        .map_err(|e| format!("Failed to finalize param file download: {}", e))?;

    model_manager::download_file(
        &app_handle,
        &model.id,
        "bin",
        &model.bin_url,
        &bin_path,
        model.bin_size,
    ).await?;

    if !model.bin_sha256.is_empty() {
        let bin_hash = calculate_sha256(&bin_path.with_extension("tmp"))?;
        if bin_hash != model.bin_sha256 {
            let _ = std::fs::remove_file(&bin_path.with_extension("tmp"));
            return Err("SHA-256 validation failed for bin file".to_string());
        }
    }
    std::fs::rename(bin_path.with_extension("tmp"), &bin_path)
        .map_err(|e| format!("Failed to finalize bin file download: {}", e))?;

    Ok(())
}

#[tauri::command]
async fn download_model(app_handle: tauri::AppHandle, model_id: String) -> Result<(), String> {
    let available = list_available_models(app_handle.clone()).await?;
    if let Some(m) = available.into_iter().find(|x| x.id == model_id) {
        download_model_files(app_handle, m).await
    } else {
        Err(format!("Model {} not found in catalog", model_id))
    }
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
) -> Result<String, String> {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let job_id = format!("job_{:x}", nanos);

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
async fn run_upscale(app_handle: tauri::AppHandle, request: UpscaleRequest) -> Result<String, String> {
    upscale_image(
        app_handle,
        request.input_path,
        request.output_path,
        request.model_id,
        request.gpu_id,
        request.scale,
        request.tile_size,
        request.is_video,
    ).await
}

#[tauri::command]
async fn cancel_upscale(job_id: String) -> Result<(), String> {
    cancel_job(&job_id)
}

#[tauri::command]
async fn enqueue_job(app_handle: tauri::AppHandle, job: Job) -> Result<(), String> {
    add_job_to_queue(app_handle, job);
    Ok(())
}

#[tauri::command]
async fn cancel_active_job(job_id: String) -> Result<(), String> {
    cancel_job(&job_id)
}

#[tauri::command]
async fn get_app_settings(app_handle: tauri::AppHandle) -> Result<AppSettings, String> {
    Ok(load_settings(&app_handle))
}

#[tauri::command]
async fn update_app_settings(app_handle: tauri::AppHandle, settings: AppSettings) -> Result<(), String> {
    save_settings(&app_handle, &settings)
}

// Native file launcher commands
#[tauri::command]
async fn open_file_native(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(&["/c", "start", "", &path])
            .spawn()
            .map_err(|e| format!("Failed to open file: {}", e))?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        open::that(&path).map_err(|e| format!("Failed to open file: {}", e))
    }
}

#[tauri::command]
async fn show_in_explorer_native(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .args(&["/select,", &path])
            .spawn()
            .map_err(|e| format!("Failed to open explorer: {}", e))?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        open::that(&path).map_err(|e| format!("Failed to open folder: {}", e))
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
            check_for_model_updates,
            download_model_files,
            download_model,
            upscale_image,
            run_upscale,
            cancel_upscale,
            enqueue_job,
            cancel_active_job,
            get_app_settings,
            update_app_settings,
            open_file_native,
            show_in_explorer_native,
            close_window,
            minimize_window,
            toggle_maximize_window
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
