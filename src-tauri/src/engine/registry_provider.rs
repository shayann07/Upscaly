use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RegistryModelEntry {
    pub id: String,
    pub name: String,
    pub version: String,
    pub note: Option<String>,
    pub cat: Option<String>,
    pub scale: Option<u32>,
    pub size: Option<String>,
    pub speed: Option<f64>,
    pub param_url: String,
    pub param_sha256: Option<String>,
    pub param_size: Option<u64>,
    pub bin_url: String,
    pub bin_sha256: Option<String>,
    pub bin_size: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RegistryManifest {
    pub schema_version: u32,
    pub updated_at: Option<String>,
    pub models: Vec<RegistryModelEntry>,
}

pub struct GitHubReleaseProvider {
    pub repo: String,
}

impl GitHubReleaseProvider {
    pub fn new(repo: &str) -> Self {
        Self {
            repo: repo.to_string(),
        }
    }

    /// Fetches release models using ETag caching for zero rate-limit penalty.
    pub async fn fetch_manifest(&self, cache_dir: &Path) -> Result<RegistryManifest, String> {
        let cache_file = cache_dir.join("registry_cache.json");
        let etag_file = cache_dir.join("registry_etag.txt");

        let cached_etag = fs::read_to_string(&etag_file).ok();

        let client = reqwest::Client::builder()
            .user_agent("UpscalyApp/1.0")
            .build()
            .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

        let primary_url = format!(
            "https://raw.githubusercontent.com/{}/main/registry/models.json",
            self.repo
        );

        let mut request = client.get(&primary_url);
        if let Some(ref etag) = cached_etag {
            request = request.header("If-None-Match", etag.trim());
        }

        let response_res = request.send().await;

        match response_res {
            Ok(resp) => {
                if resp.status() == reqwest::StatusCode::NOT_MODIFIED {
                    // 304 Not Modified: load cached catalog
                    if let Ok(content) = fs::read_to_string(&cache_file) {
                        if let Ok(manifest) = serde_json::from_str::<RegistryManifest>(&content) {
                            return Ok(manifest);
                        }
                    }
                }

                if resp.status().is_success() {
                    let new_etag = resp
                        .headers()
                        .get("etag")
                        .and_then(|v| v.to_str().ok())
                        .map(|s| s.to_string());
                    let content = resp
                        .text()
                        .await
                        .map_err(|e| format!("Failed to read registry response: {}", e))?;

                    if let Ok(manifest) = serde_json::from_str::<RegistryManifest>(&content) {
                        let _ = fs::write(&cache_file, &content);
                        if let Some(etag_str) = new_etag {
                            let _ = fs::write(&etag_file, &etag_str);
                        }
                        return Ok(manifest);
                    }
                }
            }
            Err(_) => {
                // Offline fallback to disk cache
            }
        }

        // Offline fallback to local cache_file if present
        if cache_file.exists() {
            if let Ok(content) = fs::read_to_string(&cache_file) {
                if let Ok(manifest) = serde_json::from_str::<RegistryManifest>(&content) {
                    return Ok(manifest);
                }
            }
        }

        // Default built-in registry structure
        Ok(Self::default_registry())
    }

    #[allow(clippy::unreadable_literal)]
    pub fn default_registry() -> RegistryManifest {
        RegistryManifest {
            schema_version: 1,
            updated_at: Some("2026-08-09T00:00:00Z".to_string()),
            models: vec![
                RegistryModelEntry {
                    id: "realesrgan-x4plus".to_string(),
                    name: "RealESRGAN Ultra".to_string(),
                    version: "v0.2.5".to_string(),
                    note: Some("Highest detail on photographs, portraits and landscapes".to_string()),
                    cat: Some("photo".to_string()),
                    scale: Some(4),
                    size: Some("67.0 MB".to_string()),
                    speed: Some(1.0),
                    param_url: "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-x4plus.param".to_string(),
                    param_sha256: Some("35330ececcea33b6c397a72548e788d5d53becee4734c50b7fada36e89f10a86".to_string()),
                    param_size: Some(116029),
                    bin_url: "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-x4plus.bin".to_string(),
                    bin_sha256: Some("713ee713b0353afaa27976f0563a64a5043bd70b9bd8936c2e26e25ebcdbcddf".to_string()),
                    bin_size: Some(33424520),
                },
                RegistryModelEntry {
                    id: "realesrgan-x4plus-anime".to_string(),
                    name: "RealESRGAN Anime Art".to_string(),
                    version: "v0.2.5".to_string(),
                    note: Some("Line work, flats and cel shading in illustration and manga".to_string()),
                    cat: Some("anime".to_string()),
                    scale: Some(4),
                    size: Some("17.9 MB".to_string()),
                    speed: Some(1.5),
                    param_url: "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-x4plus-anime.param".to_string(),
                    param_sha256: Some("2b8fb6e0ae4d2d85704ca08c119a2f5ea40add4f2ecd512eb7f4cd44b6127ed4".to_string()),
                    param_size: Some(30290),
                    bin_url: "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-x4plus-anime.bin".to_string(),
                    bin_sha256: Some("fe01c269cfd10cdef8e018ab66ebe750cf79c7af4d1f9c16c737e1295229bacc".to_string()),
                    bin_size: Some(8943500),
                },
                RegistryModelEntry {
                    id: "realesr-animevideov3-x2".to_string(),
                    name: "Anime Video 2×".to_string(),
                    version: "v0.2.5".to_string(),
                    note: Some("Frame sequences at low latency".to_string()),
                    cat: Some("video".to_string()),
                    scale: Some(2),
                    size: Some("2.4 MB".to_string()),
                    speed: Some(3.3),
                    param_url: "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesr-animevideov3-x2.param".to_string(),
                    param_sha256: Some("b88ff4f00ebf019a7fdac17fdd45a7fd3665d37509efc5baf2e4da2e24420a04".to_string()),
                    param_size: Some(3173),
                    bin_url: "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesr-animevideov3-x2.bin".to_string(),
                    bin_sha256: Some("548a36f9c3f4ab8da56cd3b13badf23968bee207b396dad14d04b830e5f2ab2d".to_string()),
                    bin_size: Some(1247368),
                },
                RegistryModelEntry {
                    id: "realesr-animevideov3-x3".to_string(),
                    name: "Anime Video 3×".to_string(),
                    version: "v0.2.5".to_string(),
                    note: Some("Frame sequences, balanced quality and throughput".to_string()),
                    cat: Some("video".to_string()),
                    scale: Some(3),
                    size: Some("2.4 MB".to_string()),
                    speed: Some(2.4),
                    param_url: "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesr-animevideov3-x3.param".to_string(),
                    param_sha256: Some("d1a5755008791d09b57e3425fc9dd0bd26b00fdf79c606210bc0e693f8230881".to_string()),
                    param_size: Some(3173),
                    bin_url: "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesr-animevideov3-x3.bin".to_string(),
                    bin_sha256: Some("548a36f9c3f4ab8da56cd3b13badf23968bee207b396dad14d04b830e5f2ab2d".to_string()),
                    bin_size: Some(1247368),
                },
                RegistryModelEntry {
                    id: "realesr-animevideov3-x4".to_string(),
                    name: "Anime Video 4×".to_string(),
                    version: "v0.2.5".to_string(),
                    note: Some("Frame sequences at maximum reconstruction detail".to_string()),
                    cat: Some("video".to_string()),
                    scale: Some(4),
                    size: Some("2.4 MB".to_string()),
                    speed: Some(1.8),
                    param_url: "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesr-animevideov3-x4.param".to_string(),
                    param_sha256: Some("850a248e7c14c27e5bd8cf7265113a9441036a7db63963bb8aa5169d788a435e".to_string()),
                    param_size: Some(3077),
                    bin_url: "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesr-animevideov3-x4.bin".to_string(),
                    bin_sha256: Some("548a36f9c3f4ab8da56cd3b13badf23968bee207b396dad14d04b830e5f2ab2d".to_string()),
                    bin_size: Some(1247368),
                },
            ],
        }
    }
}
