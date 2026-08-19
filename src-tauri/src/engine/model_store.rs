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
        let cache = get_param_cache()
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if let Some((cached_mtime, meta)) = cache.get(path) {
            if *cached_mtime == mtime {
                return Ok(meta.clone());
            }
        }
    }

    let meta = parse_ncnn_param(path)?;
    {
        let mut cache = get_param_cache()
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
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
    pub param_sha256: Option<String>,
    pub param_size: Option<u64>,
    pub bin_url: String,
    pub bin_sha256: Option<String>,
    pub bin_size: Option<u64>,
}

/// Model ids with a download currently in flight.
///
/// The frontend already disables a model's Download button while its own
/// download is running, but that only stops a well-behaved UI -- there is
/// nothing else preventing two concurrent `download_model` calls for the
/// same id, and `model_manager::download_file` writes to a fixed,
/// deterministic temp path (`dest_path.with_extension("tmp")`). Two
/// writers to that same file would race, and could hand the SHA-256 check
/// a corrupted interleave of two responses. This is the actual guarantee;
/// the UI guard is just about not making the user wait on a lock.
static IN_FLIGHT_DOWNLOADS: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

fn in_flight_downloads() -> &'static Mutex<HashSet<String>> {
    IN_FLIGHT_DOWNLOADS.get_or_init(|| Mutex::new(HashSet::new()))
}

/// Releases a model's in-flight claim when dropped, so every exit from
/// `download_model` -- success, a `?` on the first file, a `?` on the
/// second -- clears it exactly once without repeating that cleanup at
/// each return point.
struct DownloadGuard(String);

impl Drop for DownloadGuard {
    fn drop(&mut self) {
        if let Ok(mut set) = in_flight_downloads().lock() {
            set.remove(&self.0);
        }
    }
}

pub struct ModelStore;

impl ModelStore {
    pub async fn resolve_catalog(
        app: &AppHandle,
        models_dir: &Path,
    ) -> Result<Vec<EngineModelItem>, String> {
        let provider = GitHubReleaseProvider::new("xinntao/Real-ESRGAN");
        let manifest = provider.fetch_manifest(models_dir).await?;

        let mut catalog = Vec::new();
        let mut seen_ids = HashSet::new();

        // The bundled registry is authoritative for the models it names.
        //
        // A remote manifest supplies both the URL *and* the hash it will be
        // checked against, so letting it redefine a bundled entry would make
        // verification circular -- the download would be dutifully checked
        // against a hash chosen by whoever supplied the file. Bundled ids
        // are claimed first and a remote entry reusing one is ignored, which
        // leaves the remote manifest able to do the one useful thing (offer
        // additional models) and not the dangerous one.
        let bundled = GitHubReleaseProvider::default_registry();
        let bundled_ids: HashSet<String> = bundled.models.iter().map(|m| m.id.clone()).collect();

        for entry in bundled
            .models
            .into_iter()
            .chain(manifest.models.into_iter().filter(|m| {
                let shadows = bundled_ids.contains(&m.id);
                if shadows {
                    tracing::warn!(
                        "ignoring remote catalog entry '{}': it shadows a bundled model",
                        m.id
                    );
                }
                !shadows
            }))
        {
            if !seen_ids.insert(entry.id.clone()) {
                continue;
            }

            let param_path = models_dir.join(format!("{}.param", entry.id));
            let bin_path = models_dir.join(format!("{}.bin", entry.id));

            let status = Self::determine_model_status(&entry, &param_path, &bin_path);

            let requested_scale_i32 = i32::try_from(entry.scale.unwrap_or(4)).unwrap_or(4);
            let calculated_scale = crate::job_queue::resolve_effective_scale(
                &entry.id,
                requested_scale_i32,
                Some(models_dir),
            )
            .cast_unsigned();

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
                param_sha256: entry.param_sha256,
                param_size: entry.param_size,
                bin_url: entry.bin_url,
                bin_sha256: entry.bin_sha256,
                bin_size: entry.bin_size,
            });
        }

        // The app's own directory first, then the user's folder if one is
        // configured. Order matters: seen_ids means the app's copy wins a
        // name collision, so a file dropped in the custom folder cannot
        // shadow a bundled model and quietly change what a saved selection
        // runs. resolve_model_dir applies the same precedence when the job
        // actually executes, so the catalog and the engine never disagree
        // about which file a given id refers to.
        let mut scan_dirs = vec![models_dir.to_path_buf()];
        if let Some(custom) = crate::model_manager::get_custom_models_dir(app) {
            if custom != models_dir {
                scan_dirs.push(custom);
            }
        }

        for dir in &scan_dirs {
            Self::scan_local_models(dir, &mut seen_ids, &mut catalog);
        }

        Ok(catalog)
    }

    /// Adds every usable `.param`+`.bin` pair in `dir` that no catalog
    /// entry has already claimed.
    fn scan_local_models(
        dir: &Path,
        seen_ids: &mut HashSet<String>,
        catalog: &mut Vec<EngineModelItem>,
    ) {
        let Ok(entries) = fs::read_dir(dir) else {
            return;
        };
        for entry_res in entries.flatten() {
            let path = entry_res.path();
            if !path.is_file() || path.extension().and_then(|s| s.to_str()) != Some("param") {
                continue;
            }
            let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
                continue;
            };
            if !seen_ids.insert(stem.to_string()) {
                continue;
            }

            let bin_path = dir.join(format!("{stem}.bin"));
            // A .param with no .bin is half a model. Reported as corrupt
            // rather than omitted, so a user who dropped in one file of a
            // pair sees why it is not selectable instead of wondering where
            // it went.
            let is_corrupt = parse_ncnn_param_cached(&path).is_err() || !bin_path.exists();
            let scale =
                crate::job_queue::resolve_effective_scale(stem, 4, Some(dir)).cast_unsigned();

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
                param_sha256: None,
                param_size: None,
                bin_url: String::new(),
                bin_sha256: None,
                bin_size: None,
            });
        }
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
        if bin_meta.map_or(true, |m| m.len() == 0) {
            return ModelStatus::Corrupt;
        }

        ModelStatus::Installed
    }

    pub async fn download_model(
        app: &AppHandle,
        models_dir: &Path,
        item: &EngineModelItem,
    ) -> Result<(), String> {
        if item.param_url.is_empty() || item.bin_url.is_empty() {
            return Err(format!("No download URL configured for {}", item.id));
        }

        {
            let mut set = in_flight_downloads()
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            if !set.insert(item.id.clone()) {
                return Err(format!("{} is already downloading", item.id));
            }
        }
        let _guard = DownloadGuard(item.id.clone());

        let param_target = models_dir.join(format!("{}.param", item.id));
        let bin_target = models_dir.join(format!("{}.bin", item.id));

        // Route through model_manager::download_file, which streams progress
        // events (the frontend's download-progress listener otherwise never
        // fires) and verifies the SHA-256 the registry publishes for each
        // file -- previously a tampered or truncated download landed in the
        // models dir unchecked and only surfaced later as an opaque NCNN
        // failure.
        //
        // The two files share one progress span so the user sees a single
        // 0-100 sweep for the model, not one per file.
        let param_size = item.param_size.unwrap_or(0);
        let bin_size = item.bin_size.unwrap_or(0);
        let grand_total = if param_size > 0 && bin_size > 0 {
            param_size + bin_size
        } else {
            0
        };

        crate::model_manager::download_file(
            app,
            &item.id,
            "param",
            &item.param_url,
            &param_target,
            param_size,
            item.param_sha256.as_deref().unwrap_or(""),
            (0, grand_total),
        )
        .await?;

        crate::model_manager::download_file(
            app,
            &item.id,
            "bin",
            &item.bin_url,
            &bin_target,
            bin_size,
            item.bin_sha256.as_deref().unwrap_or(""),
            (param_size, grand_total),
        )
        .await?;

        let _ = app.emit("model-catalog-updated", ());

        Ok(())
    }
}
