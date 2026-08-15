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

    /// Fetches release models using `ETag` caching for zero rate-limit penalty.
    pub async fn fetch_manifest(&self, cache_dir: &Path) -> Result<RegistryManifest, String> {
        let cache_file = cache_dir.join("registry_cache.json");
        let etag_file = cache_dir.join("registry_etag.txt");

        let cached_etag = fs::read_to_string(&etag_file).ok();

        let client = reqwest::Client::builder()
            .user_agent("UpscalyApp/1.0")
            .build()
            .map_err(|e| format!("Failed to create HTTP client: {e}"))?;

        let primary_url = format!(
            "https://raw.githubusercontent.com/{}/main/registry/models.json",
            self.repo
        );

        let mut request = client.get(&primary_url);
        if let Some(ref etag) = cached_etag {
            request = request.header("If-None-Match", etag.trim());
        }

        let response_res = request.send().await;

        // Err falls through to the offline disk-cache fallback below.
        if let Ok(resp) = response_res {
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
                    .map(ToString::to_string);
                let content = resp
                    .text()
                    .await
                    .map_err(|e| format!("Failed to read registry response: {e}"))?;

                if let Ok(manifest) = serde_json::from_str::<RegistryManifest>(&content) {
                    let _ = fs::write(&cache_file, &content);
                    if let Some(etag_str) = new_etag {
                        let _ = fs::write(&etag_file, &etag_str);
                    }
                    return Ok(manifest);
                }
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

    /// The catalog compiled into the binary.
    ///
    /// Authoritative for the ids it names: see `ModelStore::resolve_catalog`,
    /// which refuses to let a remote manifest redefine any of them.
    #[must_use]
    pub fn default_registry() -> RegistryManifest {
        let mut models = Self::stock_models();
        models.extend(Self::community_models());
        RegistryManifest {
            schema_version: 1,
            updated_at: Some("2026-08-15T00:00:00Z".to_string()),
            models,
        }
    }

    /// The upstream Real-ESRGAN models.
    ///
    /// Hashes here match the copies bundled in `src-tauri/models`
    /// byte-for-byte, and always did. The URLs did not: they pointed at
    /// `.../releases/download/v0.2.5.0/<name>.param`, and that release
    /// ships only `.pth` weights and per-platform zips -- no loose ncnn
    /// files. All ten returned a 9-byte "Not Found" body, so every
    /// stock model's Download button was broken. It went unnoticed
    /// because these five are bundled and copied in at startup, so the
    /// download path is never exercised for them in normal use.
    ///
    /// Repointed at commit-pinned mirrors that were verified to serve
    /// identical bytes -- `upscayl-standard-4x` is `realesrgan-x4plus`
    /// and `digital-art-4x` is `realesrgan-x4plus-anime`, both confirmed
    /// by hashing rather than by their names. The hashes below are
    /// therefore unchanged.
    #[allow(clippy::unreadable_literal)]
    fn stock_models() -> Vec<RegistryModelEntry> {
        vec![
                RegistryModelEntry {
                    id: "realesrgan-x4plus".to_string(),
                    name: "RealESRGAN Ultra".to_string(),
                    version: "v0.2.5".to_string(),
                    note: Some("Highest detail on photographs, portraits and landscapes".to_string()),
                    cat: Some("photo".to_string()),
                    scale: Some(4),
                    size: Some("67.0 MB".to_string()),
                    speed: Some(1.0),
                    param_url: "https://raw.githubusercontent.com/upscayl/upscayl/a00d55fee90e0f9435d5eaa86e76700df8199af8/resources/models/upscayl-standard-4x.param".to_string(),
                    param_sha256: Some("35330ececcea33b6c397a72548e788d5d53becee4734c50b7fada36e89f10a86".to_string()),
                    param_size: Some(116029),
                    bin_url: "https://raw.githubusercontent.com/upscayl/upscayl/a00d55fee90e0f9435d5eaa86e76700df8199af8/resources/models/upscayl-standard-4x.bin".to_string(),
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
                    param_url: "https://raw.githubusercontent.com/upscayl/upscayl/a00d55fee90e0f9435d5eaa86e76700df8199af8/resources/models/digital-art-4x.param".to_string(),
                    param_sha256: Some("2b8fb6e0ae4d2d85704ca08c119a2f5ea40add4f2ecd512eb7f4cd44b6127ed4".to_string()),
                    param_size: Some(30290),
                    bin_url: "https://raw.githubusercontent.com/upscayl/upscayl/a00d55fee90e0f9435d5eaa86e76700df8199af8/resources/models/digital-art-4x.bin".to_string(),
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
                    param_url: "https://raw.githubusercontent.com/upscayl/custom-models/4b6d2cfa59c7442af115dfc6e50fd8d7d40b96ef/models/realesr-animevideov3-x2.param".to_string(),
                    param_sha256: Some("b88ff4f00ebf019a7fdac17fdd45a7fd3665d37509efc5baf2e4da2e24420a04".to_string()),
                    param_size: Some(3173),
                    bin_url: "https://raw.githubusercontent.com/upscayl/custom-models/4b6d2cfa59c7442af115dfc6e50fd8d7d40b96ef/models/realesr-animevideov3-x2.bin".to_string(),
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
                    param_url: "https://raw.githubusercontent.com/upscayl/custom-models/4b6d2cfa59c7442af115dfc6e50fd8d7d40b96ef/models/realesr-animevideov3-x3.param".to_string(),
                    param_sha256: Some("d1a5755008791d09b57e3425fc9dd0bd26b00fdf79c606210bc0e693f8230881".to_string()),
                    param_size: Some(3173),
                    bin_url: "https://raw.githubusercontent.com/upscayl/custom-models/4b6d2cfa59c7442af115dfc6e50fd8d7d40b96ef/models/realesr-animevideov3-x3.bin".to_string(),
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
                    param_url: "https://raw.githubusercontent.com/upscayl/custom-models/4b6d2cfa59c7442af115dfc6e50fd8d7d40b96ef/models/realesr-animevideov3-x4.param".to_string(),
                    param_sha256: Some("850a248e7c14c27e5bd8cf7265113a9441036a7db63963bb8aa5169d788a435e".to_string()),
                    param_size: Some(3077),
                    bin_url: "https://raw.githubusercontent.com/upscayl/custom-models/4b6d2cfa59c7442af115dfc6e50fd8d7d40b96ef/models/realesr-animevideov3-x4.bin".to_string(),
                    bin_sha256: Some("548a36f9c3f4ab8da56cd3b13badf23968bee207b396dad14d04b830e5f2ab2d".to_string()),
                    bin_size: Some(1247368),
                },
        ]
    }

    /// Community models, all ncnn conversions sharing the `RRDBNet`
    /// architecture the stock `realesrgan-x4plus` model uses.
    #[allow(clippy::unreadable_literal)]
    fn community_models() -> Vec<RegistryModelEntry> {
        vec![
            // --- Community photographic models -------------------------
            //
            // All four run at the same cost as realesrgan-x4plus, so they
            // share its 1.0 speed figure and the VRAM governor's estimate --
            // which keys off tile size and scale, not the model -- transfers
            // to them unchanged.
            //
            // Worth stating precisely, because three of the four have a
            // byte-identical .param and Remacri does not: it declares 1370
            // layers to the others' 999. The extra entries are activations
            // and residual adds written out as explicit ReLU/BinaryOp layers
            // where the others fuse them into Eltwise. The convolution graph
            // underneath is the same in all five -- 351 convolutions, 64 max
            // channels, 2 Interp upsample stages -- so the tensor shapes,
            // and therefore the peak working set, match. Layer count is not
            // memory; tensor shape is.
            //
            // URLs are pinned to a commit, never to `main`. A hash pinned
            // against a moving branch verifies nothing: the file could
            // change and downloads would simply start failing -- or,
            // had the hash been omitted, start silently installing
            // something else. Every hash below was computed from the
            // bytes these exact URLs actually served.
            //
            // The two 108,039-byte .param files legitimately share a
            // hash: same architecture definition, different weights.
            // Their .bin hashes are distinct.
            RegistryModelEntry {
                id: "remacri-4x".to_string(),
                name: "Remacri".to_string(),
                version: "v1.0.0".to_string(),
                note: Some("Sharper texture and edge detail than the stock model. A common choice for photographs and film scans".to_string()),
                cat: Some("photo".to_string()),
                scale: Some(4),
                size: Some("33.6 MB".to_string()),
                speed: Some(1.0),
                param_url: "https://raw.githubusercontent.com/upscayl/upscayl/a00d55fee90e0f9435d5eaa86e76700df8199af8/resources/models/remacri-4x.param".to_string(),
                param_sha256: Some("859ecba5b3592ecf3e76c93bed65e9f627b5236dd696aae5a84ecf8c93ab65ce".to_string()),
                param_size: Some(140295),
                bin_url: "https://raw.githubusercontent.com/upscayl/upscayl/a00d55fee90e0f9435d5eaa86e76700df8199af8/resources/models/remacri-4x.bin".to_string(),
                bin_sha256: Some("a43be595c0d743314c30b50fe7ef188be0c61cc55c46ce81adb79ba4b3c3fb7a".to_string()),
                bin_size: Some(33424520),
            },
            RegistryModelEntry {
                id: "high-fidelity-4x".to_string(),
                name: "High Fidelity".to_string(),
                version: "v1.0.0".to_string(),
                note: Some("Conservative reconstruction that stays close to the source. Least prone to inventing detail that was never there".to_string()),
                cat: Some("photo".to_string()),
                scale: Some(4),
                size: Some("33.5 MB".to_string()),
                speed: Some(1.0),
                param_url: "https://raw.githubusercontent.com/upscayl/upscayl/a00d55fee90e0f9435d5eaa86e76700df8199af8/resources/models/high-fidelity-4x.param".to_string(),
                param_sha256: Some("4576ed5c2fc5fa250d3c3d585ef02248f26abdfc1867088078f501fe71e5d61e".to_string()),
                param_size: Some(108039),
                bin_url: "https://raw.githubusercontent.com/upscayl/upscayl/a00d55fee90e0f9435d5eaa86e76700df8199af8/resources/models/high-fidelity-4x.bin".to_string(),
                bin_sha256: Some("8a135402b4f39286121b76abb47601a6b7b7e8d4f3e999a5aaa45ed277824fb4".to_string()),
                bin_size: Some(33424520),
            },
            RegistryModelEntry {
                id: "ultrasharp-4x".to_string(),
                name: "UltraSharp".to_string(),
                version: "v1.0.0".to_string(),
                note: Some("Strong edge definition and micro-contrast. Can over-sharpen sources that were already crisp".to_string()),
                cat: Some("photo".to_string()),
                scale: Some(4),
                size: Some("33.5 MB".to_string()),
                speed: Some(1.0),
                param_url: "https://raw.githubusercontent.com/upscayl/upscayl/a00d55fee90e0f9435d5eaa86e76700df8199af8/resources/models/ultrasharp-4x.param".to_string(),
                param_sha256: Some("0136ca83686809a8f17f7111f11b951e8db93610e24b7f4137c9ffe4dbc4a806".to_string()),
                param_size: Some(116029),
                bin_url: "https://raw.githubusercontent.com/upscayl/upscayl/a00d55fee90e0f9435d5eaa86e76700df8199af8/resources/models/ultrasharp-4x.bin".to_string(),
                bin_sha256: Some("fb3e279d40d4cddb44db4e684d59e68d0aa39852c8cc14dc3f23ccc7e6eee9c1".to_string()),
                bin_size: Some(33424520),
            },
            RegistryModelEntry {
                id: "4xNomos8kSC".to_string(),
                name: "Nomos 8k SC".to_string(),
                version: "v1.0.0".to_string(),
                note: Some("Photographic training set with natural texture. Gentler than UltraSharp on skin and foliage".to_string()),
                cat: Some("photo".to_string()),
                scale: Some(4),
                size: Some("33.5 MB".to_string()),
                speed: Some(1.0),
                param_url: "https://raw.githubusercontent.com/upscayl/custom-models/4b6d2cfa59c7442af115dfc6e50fd8d7d40b96ef/models/4xNomos8kSC.param".to_string(),
                param_sha256: Some("4576ed5c2fc5fa250d3c3d585ef02248f26abdfc1867088078f501fe71e5d61e".to_string()),
                param_size: Some(108039),
                bin_url: "https://raw.githubusercontent.com/upscayl/custom-models/4b6d2cfa59c7442af115dfc6e50fd8d7d40b96ef/models/4xNomos8kSC.bin".to_string(),
                bin_sha256: Some("da16e3880d87b177b7c6b659bbd880f8a101b868eb9ebc08d69eaa6d3edc4517".to_string()),
                bin_size: Some(33424520),
            },
        ]
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn test_every_bundled_model_carries_both_hashes() {
        // download_file refuses to install anything without a hash, so an
        // entry missing one is not a weaker download -- it is a model that
        // can never be installed at all. Cheaper to catch here than as a
        // support question.
        for m in GitHubReleaseProvider::default_registry().models {
            assert!(
                m.param_sha256.as_ref().is_some_and(|h| h.len() == 64),
                "{} has no usable param sha256",
                m.id
            );
            assert!(
                m.bin_sha256.as_ref().is_some_and(|h| h.len() == 64),
                "{} has no usable bin sha256",
                m.id
            );
            assert!(m.param_size.is_some_and(|s| s > 0), "{} param_size", m.id);
            assert!(m.bin_size.is_some_and(|s| s > 0), "{} bin_size", m.id);
        }
    }

    #[test]
    fn test_no_bundled_url_points_at_a_moving_branch() {
        // A hash pinned against `main` verifies nothing useful: the content
        // it names can be replaced, at which point downloads either break or
        // -- worse -- the hash gets "fixed" to match whatever is there now.
        // Release tags and commit SHAs are the only acceptable anchors.
        for m in GitHubReleaseProvider::default_registry().models {
            for url in [&m.param_url, &m.bin_url] {
                assert!(
                    !url.contains("/main/") && !url.contains("/master/"),
                    "{} points at a branch: {url}",
                    m.id
                );
                assert!(url.starts_with("https://"), "{} is not https: {url}", m.id);
            }
        }
    }

    #[test]
    fn test_declared_hashes_match_the_models_actually_shipped() {
        // For every model bundled in src-tauri/models, the bytes on disk
        // must hash to what the catalog claims. This is the half of the
        // contract that can be checked without a network: if a bundled file
        // is ever updated without updating its entry, the app would ship one
        // model and advertise the hash of another, and re-downloading it
        // would fail with an integrity error that looked like tampering.
        //
        // It does not check that the URLs still serve those bytes. That
        // needs a live request, and this suite deliberately makes none --
        // but note the URLs are pinned to immutable commits precisely so
        // that what they serve cannot drift.
        let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("models");
        let mut checked = 0;
        for m in GitHubReleaseProvider::default_registry().models {
            for (ext, declared) in [("param", &m.param_sha256), ("bin", &m.bin_sha256)] {
                let path = dir.join(format!("{}.{ext}", m.id));
                if !path.is_file() {
                    continue; // not bundled; downloaded on demand
                }
                let actual = crate::model_manager::calculate_sha256(&path)
                    .unwrap_or_else(|e| panic!("hashing {}: {e}", path.display()));
                assert_eq!(
                    Some(&actual),
                    declared.as_ref(),
                    "{}.{ext} on disk does not match the catalog",
                    m.id
                );
                checked += 1;
            }
        }
        assert!(checked > 0, "no bundled models found to verify");
    }

    #[test]
    fn test_bundled_ids_are_unique() {
        // resolve_catalog claims bundled ids first and drops later
        // duplicates, so a repeated id here would silently hide one entry.
        let models = GitHubReleaseProvider::default_registry().models;
        let unique: HashSet<&String> = models.iter().map(|m| &m.id).collect();
        assert_eq!(unique.len(), models.len());
    }

    #[test]
    fn test_the_community_models_the_catalog_promises_are_present() {
        let ids: HashSet<String> = GitHubReleaseProvider::default_registry()
            .models
            .into_iter()
            .map(|m| m.id)
            .collect();
        for expected in [
            "realesrgan-x4plus",
            "remacri-4x",
            "high-fidelity-4x",
            "ultrasharp-4x",
            "4xNomos8kSC",
        ] {
            assert!(ids.contains(expected), "missing {expected}");
        }
    }
}
