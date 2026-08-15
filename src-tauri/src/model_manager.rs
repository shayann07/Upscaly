use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, Manager};

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
                std::ptr::from_mut(&mut free_bytes),
                std::ptr::from_mut(&mut total_bytes),
                std::ptr::from_mut(&mut total_free),
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

/// Calculates SHA-256 hash of a file.
pub fn calculate_sha256(path: &Path) -> Result<String, String> {
    let mut file = File::open(path).map_err(|e| format!("Failed to open file for hashing: {e}"))?;
    let mut hasher = Sha256::new();
    // 64KB read buffer on a non-recursive leaf function -- fine on the stack,
    // and avoids a heap allocation on every hash read loop iteration setup.
    #[allow(clippy::large_stack_arrays)]
    let mut buffer = [0; 65536];
    loop {
        let n = file
            .read(&mut buffer)
            .map_err(|e| format!("Read error: {e}"))?;
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
// Progress percentage precision loss from the u64 byte counts is
// inconsequential at file-download sizes (nowhere near f64's 52-bit
// mantissa limit) and is only ever displayed rounded to one decimal.
#[allow(clippy::cast_precision_loss)]
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
        request = request.header("Range", format!("bytes={downloaded}-"));
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

    // truncate(false): resume support below depends on the existing partial
    // download surviving the open -- it's truncated explicitly via set_len(0)
    // only when a resume isn't possible.
    let mut file = OpenOptions::new()
        .create(true)
        .write(true)
        .read(true)
        .truncate(false)
        .open(&temp_path)
        .map_err(|e| format!("Failed to open temp file: {e}"))?;

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
                "Integrity check failed for model '{model_id}' ({file_type}): expected SHA-256 {expected_sha256}, got {actual_hash}"
            ));
        }
    }

    // Atomic rename from temp file to final dest file
    std::fs::rename(&temp_path, dest_path)
        .map_err(|e| format!("Failed to finalize model download: {e}"))?;

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
