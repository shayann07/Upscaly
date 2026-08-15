use crate::engine::model_store::{ModelStatus, ModelStore};
use crate::model_manager::get_models_dir;
use serde::{Deserialize, Serialize};

fn get_installed_models_impl(app_handle: &tauri::AppHandle) -> Vec<String> {
    let models_dir = get_models_dir(app_handle);
    let mut installed = Vec::new();

    if let Ok(entries) = std::fs::read_dir(models_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().is_some_and(|ext| ext == "param") {
                let bin_path = path.with_extension("bin");
                if bin_path.exists() {
                    if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                        installed.push(stem.to_string());
                    }
                }
            }
        }
    }

    installed
}

#[tauri::command]
pub async fn list_installed_models(app_handle: tauri::AppHandle) -> Result<Vec<String>, String> {
    Ok(get_installed_models_impl(&app_handle))
}

// Mirrors the frontend ModelInfo shape (all four flags are independent facts
// about a catalog entry), so bundling them into an enum would fight the
// serde contract rather than simplify anything.
#[allow(clippy::struct_excessive_bools)]
#[derive(Debug, Serialize, Deserialize, Clone, ts_rs::TS)]
#[ts(export, export_to = "../../src/lib/ipc/")]
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
pub async fn download_model(app_handle: tauri::AppHandle, model_id: String) -> Result<(), String> {
    let models_dir = get_models_dir(&app_handle);
    let items = ModelStore::resolve_catalog(&app_handle, &models_dir).await?;
    if let Some(target_item) = items.into_iter().find(|m| m.id == model_id) {
        ModelStore::download_model(&app_handle, &models_dir, &target_item).await?;
        Ok(())
    } else {
        Err(format!("Model '{model_id}' not found in catalog"))
    }
}
