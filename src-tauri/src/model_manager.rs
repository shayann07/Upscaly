use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ModelItem {
    pub id: String,
    pub name: String,
    pub version: String,
    #[serde(default)]
    pub note: Option<String>,
    #[serde(default)]
    pub cat: Option<String>,
    #[serde(default)]
    pub scale: Option<u32>,
    #[serde(default)]
    pub size: Option<String>,
    #[serde(default)]
    pub speed: Option<f64>,
    pub param_url: String,
    pub param_sha256: String,
    pub param_size: u64,
    pub bin_url: String,
    pub bin_sha256: String,
    pub bin_size: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ManifestData {
    pub models: Vec<ModelItem>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SignedManifest {
    pub signature: String,
    pub data: String, // JSON string of ManifestData
}

#[allow(dead_code)]
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DownloadProgress {
    pub model_id: String,
    pub file_type: String, // "param" or "bin"
    pub downloaded: u64,
    pub total: u64,
    pub percentage: f64,
}

#[cfg(windows)]
#[link(name = "kernel32")]
extern "system" {
    #[allow(dead_code)]
    fn GetDiskFreeSpaceExW(
        lpDirectoryName: *const u16,
        lpFreeBytesAvailableToCaller: *mut u64,
        lpTotalNumberOfBytes: *mut u64,
        lpTotalNumberOfFreeBytes: *mut u64,
    ) -> i32;
}

/// Queries free disk space available in bytes.
pub fn get_available_disk_space(dir: &Path) -> Result<u64, String> {
    #[cfg(windows)]
    #[allow(unsafe_code)]
    {
        use std::os::windows::ffi::OsStrExt;
        let parent_dir = if dir.exists() {
            dir.to_path_buf()
        } else {
            dir.parent().unwrap_or(Path::new("C:\\")).to_path_buf()
        };
        let wide_path: Vec<u16> = parent_dir
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        let mut free_bytes = 0u64;
        let mut total_bytes = 0u64;
        let mut total_free = 0u64;
        let res = unsafe {
            GetDiskFreeSpaceExW(
                wide_path.as_ptr(),
                &mut free_bytes,
                &mut total_bytes,
                &mut total_free,
            )
        };
        if res == 0 {
            return Err("Failed to query disk space".to_string());
        }
        Ok(free_bytes)
    }
    #[cfg(not(windows))]
    {
        Ok(u64::MAX)
    }
}

/// Verifies Ed25519 signature of data against a hex-encoded public key.
pub fn verify_signature(
    data: &[u8],
    signature_hex: &str,
    public_key_hex: &str,
) -> Result<(), String> {
    let public_key_bytes = hex::decode(public_key_hex).map_err(|e| e.to_string())?;
    let signature_bytes = hex::decode(signature_hex).map_err(|e| e.to_string())?;

    let public_key_array: [u8; 32] = public_key_bytes
        .try_into()
        .map_err(|_| "Invalid public key length. Must be 32 bytes.")?;
    let signature_array: [u8; 64] = signature_bytes
        .try_into()
        .map_err(|_| "Invalid signature length. Must be 64 bytes.")?;

    let verifying_key = VerifyingKey::from_bytes(&public_key_array)
        .map_err(|e| format!("Failed to parse public key: {}", e))?;
    let signature = Signature::from_bytes(&signature_array);

    verifying_key
        .verify(data, &signature)
        .map_err(|e| format!("Ed25519 signature verification failed: {}", e))
}

/// Calculates SHA-256 hash of a file.
pub fn calculate_sha256(path: &Path) -> Result<String, String> {
    let mut file =
        File::open(path).map_err(|e| format!("Failed to open file for hashing: {}", e))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0; 65536];
    loop {
        let n = file
            .read(&mut buffer)
            .map_err(|e| format!("Read error: {}", e))?;
        if n == 0 {
            break;
        }
        hasher.update(&buffer[..n]);
    }
    Ok(hex::encode(hasher.finalize()))
}

/// Returns local models directory, ensuring bundled models are copied if missing.
pub fn get_models_dir(app: &AppHandle) -> PathBuf {
    let app_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    let models_dir = app_dir.join("models");
    if !models_dir.exists() {
        let _ = std::fs::create_dir_all(&models_dir);
    }
    copy_bundled_models(app, &models_dir);
    models_dir
}

/// Copies bundled model weights into the writable app data models directory if not already present.
pub fn copy_bundled_models(app: &AppHandle, dest_dir: &Path) {
    let mut candidate_dirs = Vec::new();

    if let Ok(path) = app
        .path()
        .resolve("models", tauri::path::BaseDirectory::Resource)
    {
        candidate_dirs.push(path);
    }
    if let Ok(path) = app
        .path()
        .resolve("src-tauri/models", tauri::path::BaseDirectory::Resource)
    {
        candidate_dirs.push(path);
    }
    candidate_dirs.push(PathBuf::from("src-tauri").join("models"));
    candidate_dirs.push(PathBuf::from("models"));

    if let Ok(mut exe_path) = std::env::current_exe() {
        exe_path.pop();
        candidate_dirs.push(exe_path.join("models"));
        candidate_dirs.push(exe_path.join("resources").join("models"));
    }

    for src_dir in candidate_dirs {
        if src_dir.exists() && src_dir.is_dir() {
            if let Ok(entries) = std::fs::read_dir(&src_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if let Some(filename) = path.file_name() {
                        let target_path = dest_dir.join(filename);
                        if !target_path.exists() {
                            let _ = std::fs::copy(&path, &target_path);
                        }
                    }
                }
            }
        }
    }
}

/// Downloads a single file with resume capability and progress updates.
#[allow(dead_code)]
pub async fn download_file(
    app: &AppHandle,
    model_id: &str,
    file_type: &str,
    url: &str,
    dest_path: &Path,
    expected_size: u64,
    expected_sha256: &str,
) -> Result<(), String> {
    let temp_path = dest_path.with_extension("tmp");

    // Resume download logic
    let mut downloaded = 0u64;
    if temp_path.exists() {
        if let Ok(metadata) = std::fs::metadata(&temp_path) {
            downloaded = metadata.len();
            // If the temp file is larger than expected, delete it and start over
            if expected_size > 0 && downloaded > expected_size {
                let _ = std::fs::remove_file(&temp_path);
                downloaded = 0;
            }
        }
    }

    let client = reqwest::Client::new();
    let mut request = client.get(url);

    if downloaded > 0 {
        request = request.header("Range", format!("bytes={}-", downloaded));
    }

    let response = request.send().await.map_err(|e| e.to_string())?;

    if !response.status().is_success() && response.status() != reqwest::StatusCode::PARTIAL_CONTENT
    {
        return Err(format!(
            "Download request failed with status: {}",
            response.status()
        ));
    }

    let is_partial = response.status() == reqwest::StatusCode::PARTIAL_CONTENT;

    let mut file = OpenOptions::new()
        .create(true)
        .write(true)
        .read(true)
        .open(&temp_path)
        .map_err(|e| format!("Failed to open temp file: {}", e))?;

    if !is_partial || downloaded == 0 {
        file.set_len(0).map_err(|e| e.to_string())?;
        file.seek(SeekFrom::Start(0)).map_err(|e| e.to_string())?;
        downloaded = 0;
    } else {
        file.seek(SeekFrom::End(0)).map_err(|e| e.to_string())?;
    }

    let mut stream = response.bytes_stream();
    while let Some(item) = stream.next().await {
        let chunk = item.map_err(|e| e.to_string())?;
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;

        let percentage = if expected_size > 0 {
            (downloaded as f64 / expected_size as f64) * 100.0
        } else {
            0.0
        };

        // Emit progress event to Tauri webview
        let _ = app.emit(
            "download-progress",
            DownloadProgress {
                model_id: model_id.to_string(),
                file_type: file_type.to_string(),
                downloaded,
                total: expected_size,
                percentage,
            },
        );
    }

    // Explicitly flush and drop file before verification
    let _ = file.flush();
    drop(file);

    // Integrity verification
    if !expected_sha256.is_empty() {
        let actual_hash = calculate_sha256(&temp_path)?;
        if !actual_hash.eq_ignore_ascii_case(expected_sha256) {
            let _ = std::fs::remove_file(&temp_path);
            return Err(format!(
                "Integrity check failed for model '{}' ({}): expected SHA-256 {}, got {}",
                model_id, file_type, expected_sha256, actual_hash
            ));
        }
    }

    // Atomic rename from temp file to final dest file
    std::fs::rename(&temp_path, dest_path)
        .map_err(|e| format!("Failed to finalize model download: {}", e))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn test_calculate_sha256() {
        let temp_dir = std::env::temp_dir();
        let test_file = temp_dir.join("upscaly_sha256_test.txt");

        {
            let mut f = std::fs::File::create(&test_file).unwrap();
            f.write_all(b"Upscaly Real-ESRGAN Vulkan").unwrap();
        }

        let hash = calculate_sha256(&test_file).unwrap();
        assert_eq!(hash.len(), 64);

        let _ = std::fs::remove_file(&test_file);
    }
}
