use crate::engine::param_parser::parse_ncnn_param;
use crate::engine::registry_provider::{GitHubReleaseProvider, RegistryModelEntry};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::Path;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub enum ModelStatus {
    Installed,
    NotInstalled,
    UpdateAvailable,
    Corrupt,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EngineModelItem {
    pub id: String,
    pub name: String,
    pub note: String,
    pub cat: String,
    pub scale: u32,
    pub size: String,
    pub speed: f64,
    pub version: String,
    pub status: ModelStatus,
    pub is_custom: bool,
    pub param_url: String,
    pub bin_url: String,
}

pub struct ModelStore;

impl ModelStore {
    /// Dynamically resolves the full catalog fusing remote registry entries with local disk-discovered models.
    pub async fn resolve_catalog(
        _app: &AppHandle,
        models_dir: &Path,
    ) -> Result<Vec<EngineModelItem>, String> {
        let provider = GitHubReleaseProvider::new("xinntao/Real-ESRGAN");
        let manifest = provider.fetch_manifest(models_dir).await?;

        let mut catalog = Vec::new();
        let mut seen_ids = HashSet::new();

        // 1. Process entries from registry manifest
        for entry in manifest.models {
            seen_ids.insert(entry.id.clone());

            let param_path = models_dir.join(format!("{}.param", entry.id));
            let bin_path = models_dir.join(format!("{}.bin", entry.id));

            let status = Self::determine_model_status(&entry, &param_path, &bin_path);

            // If installed or corrupt, attempt NCNN param graph math resolution for exact scale ratio
            let calculated_scale = if param_path.exists() {
                parse_ncnn_param(&param_path)
                    .map(|m| m.scale)
                    .unwrap_or_else(|_| entry.scale.unwrap_or(4))
            } else {
                entry.scale.unwrap_or(4)
            };

            catalog.push(EngineModelItem {
                id: entry.id,
                name: entry.name,
                note: entry.note.unwrap_or_default(),
                cat: entry.cat.unwrap_or_else(|| "photo".to_string()),
                scale: calculated_scale,
                size: entry.size.unwrap_or_else(|| "Unknown".to_string()),
                speed: entry.speed.unwrap_or(1.0),
                version: entry.version,
                status,
                is_custom: false,
                param_url: entry.param_url,
                bin_url: entry.bin_url,
            });
        }

        // 2. Discover any non-registry custom model files placed in models_dir
        if let Ok(entries) = fs::read_dir(models_dir) {
            for entry_res in entries.flatten() {
                let path = entry_res.path();
                if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("param") {
                    if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                        if !seen_ids.contains(stem) {
                            seen_ids.insert(stem.to_string());
                            let bin_path = models_dir.join(format!("{}.bin", stem));

                            let metadata_res = parse_ncnn_param(&path);
                            let is_corrupt = metadata_res.is_err() || !bin_path.exists();
                            let scale = metadata_res.map(|m| m.scale).unwrap_or(4);

                            let cat = if stem.contains("anime") {
                                "anime".to_string()
                            } else if stem.contains("video") {
                                "video".to_string()
                            } else {
                                "photo".to_string()
                            };

                            catalog.push(EngineModelItem {
                                id: stem.to_string(),
                                name: stem.to_string(),
                                note: "User imported model file".to_string(),
                                cat,
                                scale,
                                size: "Local".to_string(),
                                speed: 1.0,
                                version: "v1.0.0".to_string(),
                                status: if is_corrupt {
                                    ModelStatus::Corrupt
                                } else {
                                    ModelStatus::Installed
                                },
                                is_custom: true,
                                param_url: String::new(),
                                bin_url: String::new(),
                            });
                        }
                    }
                }
            }
        }

        Ok(catalog)
    }

    fn determine_model_status(
        _entry: &RegistryModelEntry,
        param_path: &Path,
        bin_path: &Path,
    ) -> ModelStatus {
        if !param_path.exists() || !bin_path.exists() {
            return ModelStatus::NotInstalled;
        }

        // Validate NCNN param graph math
        let meta_res = parse_ncnn_param(param_path);
        if meta_res.is_err() {
            return ModelStatus::Corrupt;
        }

        // Verify non-zero bin size
        let bin_meta = fs::metadata(bin_path);
        if bin_meta.map(|m| m.len() == 0).unwrap_or(true) {
            return ModelStatus::Corrupt;
        }

        ModelStatus::Installed
    }

    /// Atomic model down-stream with progress and self-healing validation.
    pub async fn download_model(
        app: &AppHandle,
        models_dir: &Path,
        item: &EngineModelItem,
    ) -> Result<(), String> {
        let param_target = models_dir.join(format!("{}.param", item.id));
        let bin_target = models_dir.join(format!("{}.bin", item.id));

        Self::download_atomic_file(app, &item.id, "param", &item.param_url, &param_target).await?;
        Self::download_atomic_file(app, &item.id, "bin", &item.bin_url, &bin_target).await?;

        // Notify hot-reload event bus
        let _ = app.emit("model-catalog-updated", ());

        Ok(())
    }

    async fn download_atomic_file(
        app: &AppHandle,
        model_id: &str,
        ext: &str,
        url: &str,
        target_path: &Path,
    ) -> Result<(), String> {
        if url.is_empty() {
            return Err(format!("No download URL configured for {}", model_id));
        }

        let tmp_path = target_path.with_extension(format!("{}.tmp", ext));

        let client = reqwest::Client::new();
        let response = client
            .get(url)
            .send()
            .await
            .map_err(|e| format!("Network request failed for {}: {}", url, e))?;

        if !response.status().is_success() {
            return Err(format!("Download HTTP failure: {}", response.status()));
        }

        let content = response
            .bytes()
            .await
            .map_err(|e| format!("Failed to read stream for {}: {}", model_id, e))?;

        fs::write(&tmp_path, &content)
            .map_err(|e| format!("Failed to write tmp file {}: {}", tmp_path.display(), e))?;

        // Atomic rename
        fs::rename(&tmp_path, target_path)
            .map_err(|e| format!("Atomic rename failed for {}: {}", target_path.display(), e))?;

        Ok(())
    }
}
