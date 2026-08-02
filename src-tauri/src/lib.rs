pub mod error;
mod sidecar_manager;
mod model_manager;
mod job_queue;
mod video_pipeline;

pub use error::AppError;

use sidecar_manager::{GpuDevice, get_gpu_list, kill_all_processes};
use model_manager::{ModelItem, SignedManifest, ManifestData, verify_signature, get_models_dir, calculate_sha256, get_available_disk_space};
use job_queue::{Job, add_job_to_queue, cancel_job};

// Baked-in public key for verifying signed model manifests.
// In production, this prevents MITM attackers from serving custom models.
const BAKED_PUBLIC_KEY: &str = "0000000000000000000000000000000000000000000000000000000000000000"; // Replace with your real hex-encoded public key

#[tauri::command]
async fn list_gpus(app_handle: tauri::AppHandle) -> Result<Vec<GpuDevice>, String> {
    get_gpu_list(&app_handle)
}

#[tauri::command]
async fn get_installed_models(app_handle: tauri::AppHandle) -> Result<Vec<String>, String> {
    let models_dir = get_models_dir(&app_handle);
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
async fn check_for_model_updates(_app_handle: tauri::AppHandle, remote_manifest_url: String) -> Result<Vec<ModelItem>, String> {
    let client = reqwest::Client::new();
    let response = client.get(&remote_manifest_url)
        .send()
        .await
        .map_err(|e| format!("Failed to download remote manifest: {}", e))?;

    let signed_manifest: SignedManifest = response.json()
        .await
        .map_err(|e| format!("Invalid manifest format. Failed to parse signed manifest: {}", e))?;

    // Verify Ed25519 signature
    verify_signature(
        signed_manifest.data.as_bytes(),
        &signed_manifest.signature,
        BAKED_PUBLIC_KEY,
    ).map_err(|e| format!("Security check failed: {}", e))?;

    // Parse verified manifest data
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

    // Check disk space before downloading
    let free_space = get_available_disk_space(&models_dir)?;
    if free_space < total_size + 50 * 1024 * 1024 { // total size + 50MB safety margin
        return Err("Insufficient disk space on destination drive".to_string());
    }

    let param_path = models_dir.join(format!("{}.param", model.id));
    let bin_path = models_dir.join(format!("{}.bin", model.id));

    // Download param file
    model_manager::download_file(
        &app_handle,
        &model.id,
        "param",
        &model.param_url,
        &param_path,
        model.param_size,
    ).await?;

    // Verify param SHA-256
    let param_hash = calculate_sha256(&param_path.with_extension("tmp"))?;
    if param_hash != model.param_sha256 {
        let _ = std::fs::remove_file(&param_path.with_extension("tmp"));
        return Err("SHA-256 validation failed for param file".to_string());
    }
    // Atomic rename
    std::fs::rename(param_path.with_extension("tmp"), &param_path)
        .map_err(|e| format!("Failed to finalize param file download: {}", e))?;

    // Download bin file
    model_manager::download_file(
        &app_handle,
        &model.id,
        "bin",
        &model.bin_url,
        &bin_path,
        model.bin_size,
    ).await?;

    // Verify bin SHA-256
    let bin_hash = calculate_sha256(&bin_path.with_extension("tmp"))?;
    if bin_hash != model.bin_sha256 {
        let _ = std::fs::remove_file(&bin_path.with_extension("tmp"));
        return Err("SHA-256 validation failed for bin file".to_string());
    }
    // Atomic rename
    std::fs::rename(bin_path.with_extension("tmp"), &bin_path)
        .map_err(|e| format!("Failed to finalize bin file download: {}", e))?;

    Ok(())
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            list_gpus,
            get_installed_models,
            check_for_model_updates,
            download_model_files,
            enqueue_job,
            cancel_active_job
        ])
        .on_window_event(|_window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                // Kill all active sidecar processes on window destruction/app exit
                kill_all_processes();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
