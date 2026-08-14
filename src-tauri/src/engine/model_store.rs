use crate::engine::param_parser::{parse_ncnn_param, ModelMetadata};
use crate::engine::registry_provider::{GitHubReleaseProvider, RegistryModelEntry};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::SystemTime;
use tauri::{AppHandle, Emitter};

static PARAM_CACHE: OnceLock<Mutex<HashMap<PathBuf, (SystemTime, ModelMetadata)>>> =
    OnceLock::new();

fn get_param_cache() -> &'static Mutex<HashMap<PathBuf, (SystemTime, ModelMetadata)>> {
    PARAM_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn parse_ncnn_param_cached(path: &Path) -> Result<ModelMetadata, String> {
    let mtime = fs::metadata(path)
        .and_then(|m| m.modified())
        .unwrap_or(SystemTime::UNIX_EPOCH);

    {
        let cache = get_param_cache().lock().unwrap_or_else(|p| p.into_inner());
        if let Some((cached_mtime, meta)) = cache.get(path) {
            if *cached_mtime == mtime {
                return Ok(meta.clone());
            }
        }
    }

    let meta = parse_ncnn_param(path)?;
    {
        let mut cache = get_param_cache().lock().unwrap_or_else(|p| p.into_inner());
        cache.insert(path.to_path_buf(), (mtime, meta.clone()));
    }
    Ok(meta)
}

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
    pub async fn resolve_catalog(
        _app: &AppHandle,
        models_dir: &Path,
    ) -> Result<Vec<EngineModelItem>, String> {
        let provider = GitHubReleaseProvider::new("xinntao/Real-ESRGAN");
        let manifest = provider.fetch_manifest(models_dir).await?;

        let mut catalog = Vec::new();
        let mut seen_ids = HashSet::new();

        for entry in manifest.models {
            seen_ids.insert(entry.id.clone());

            let param_path = models_dir.join(format!("{}.param", entry.id));
            let bin_path = models_dir.join(format!("{}.bin", entry.id));

            let status = Self::determine_model_status(&entry, &param_path, &bin_path);

            let requested_scale_i32 = i32::try_from(entry.scale.unwrap_or(4)).unwrap_or(4);
            let calculated_scale = crate::job_queue::resolve_effective_scale(
                &entry.id,
                requested_scale_i32,
                Some(models_dir),
            ) as u32;

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

        if let Ok(entries) = fs::read_dir(models_dir) {
            for entry_res in entries.flatten() {
                let path = entry_res.path();
                if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("param") {
                    if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                        if !seen_ids.contains(stem) {
                            seen_ids.insert(stem.to_string());
                            let bin_path = models_dir.join(format!("{}.bin", stem));

                            let metadata_res = parse_ncnn_param_cached(&path);
                            let is_corrupt = metadata_res.is_err() || !bin_path.exists();
                            let scale = crate::job_queue::resolve_effective_scale(
                                stem,
                                4,
                                Some(models_dir),
                            ) as u32;

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

        let meta_res = parse_ncnn_param_cached(param_path);
        if meta_res.is_err() {
            return ModelStatus::Corrupt;
        }

        let bin_meta = fs::metadata(bin_path);
        if bin_meta.map(|m| m.len() == 0).unwrap_or(true) {
            return ModelStatus::Corrupt;
        }

        ModelStatus::Installed
    }

    pub async fn download_model(
        app: &AppHandle,
        models_dir: &Path,
        item: &EngineModelItem,
    ) -> Result<(), String> {
        let param_target = models_dir.join(format!("{}.param", item.id));
        let bin_target = models_dir.join(format!("{}.bin", item.id));

        Self::download_atomic_file(app, &item.id, "param", &item.param_url, &param_target).await?;
        Self::download_atomic_file(app, &item.id, "bin", &item.bin_url, &bin_target).await?;

        let _ = app.emit("model-catalog-updated", ());

        Ok(())
    }

    async fn download_atomic_file(
        _app: &AppHandle,
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

        fs::rename(&tmp_path, target_path)
            .map_err(|e| format!("Atomic rename failed for {}: {}", target_path.display(), e))?;

        Ok(())
    }
}
