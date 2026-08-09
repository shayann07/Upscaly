use crate::engine::model_store::{ModelStatus, ModelStore};
use crate::model_manager::{
    get_models_dir, verify_signature, ManifestData, ModelItem, SignedManifest,
};
use serde::{Deserialize, Serialize};

// Baked-in public key for verifying signed model manifests.
const BAKED_PUBLIC_KEY: &str = "0000000000000000000000000000000000000000000000000000000000000000";

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
pub async fn list_installed_models(app_handle: tauri::AppHandle) -> Result<Vec<String>, String> {
    get_installed_models_impl(&app_handle)
}

#[tauri::command]
pub async fn get_installed_models(app_handle: tauri::AppHandle) -> Result<Vec<String>, String> {
    get_installed_models_impl(&app_handle)
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
pub async fn get_model_catalog(app_handle: tauri::AppHandle) -> Result<Vec<FullModelInfo>, String> {
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
pub async fn list_available_models(app_handle: tauri::AppHandle) -> Result<Vec<ModelItem>, String> {
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
pub async fn check_for_model_updates(
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
pub async fn download_model(app_handle: tauri::AppHandle, model_id: String) -> Result<(), String> {
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
pub async fn download_model_files(
    app_handle: tauri::AppHandle,
    model: ModelItem,
) -> Result<(), String> {
    download_model(app_handle, model.id).await
}

#[tauri::command]
pub async fn repair_model(app_handle: tauri::AppHandle, model_id: String) -> Result<(), String> {
    download_model(app_handle, model_id).await
}
