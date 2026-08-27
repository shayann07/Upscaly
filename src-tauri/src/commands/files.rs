use tauri::{AppHandle, Manager};

fn validate_safe_path(path_str: &str) -> Result<std::path::PathBuf, String> {
    if path_str.trim().is_empty() {
        return Err("Path cannot be empty".to_string());
    }
    let path = std::path::PathBuf::from(path_str);
    if path
        .components()
        .any(|c| matches!(c, std::path::Component::ParentDir))
    {
        return Err("Parent directory traversal (..) is prohibited in file paths".to_string());
    }
    Ok(path)
}

#[tauri::command]
pub async fn get_file_size_bytes(path: String) -> Result<u64, String> {
    let p = validate_safe_path(&path)?;
    let meta = std::fs::metadata(&p).map_err(|e| format!("Failed to read file metadata: {e}"))?;
    Ok(meta.len())
}

const SUPPORTED_MEDIA_EXTS: &[&str] = &["png", "jpg", "jpeg", "webp", "mp4", "mkv", "mov", "avi"];

/// Lists all supported media files directly inside the given directory.
#[tauri::command]
pub async fn list_media_files(path: String) -> Result<Vec<String>, String> {
    let p = validate_safe_path(&path)?;
    if !p.is_dir() {
        return Err("Provided path is not a directory".to_string());
    }

    let entries = std::fs::read_dir(&p).map_err(|e| format!("Failed to read directory: {e}"))?;
    let mut files = Vec::new();

    for entry in entries.flatten() {
        let entry_path = entry.path();
        if entry_path.is_file() {
            if let Some(ext) = entry_path.extension().and_then(|e| e.to_str()) {
                let ext_lower = ext.to_lowercase();
                if SUPPORTED_MEDIA_EXTS.contains(&ext_lower.as_str()) {
                    files.push(entry_path.to_string_lossy().into_owned());
                }
            }
        }
    }

    files.sort();
    Ok(files)
}

/// Grants the webview's `asset:` protocol read access to the directory
/// containing `path` (or `path` itself, if it is already a directory).
///
/// The app lets the user pick media files from anywhere on disk, so the
/// asset protocol's static scope in `tauri.conf.json` is intentionally
/// empty -- nothing is readable by default. Instead, whenever the user
/// actually selects a file/folder, sets a custom output directory, or
/// loads a history entry, the frontend calls this command to extend
/// access to exactly that one directory (non-recursive), which is enough
/// to preview both the input file and its sibling output file.
#[tauri::command]
pub async fn allow_media_path(app: AppHandle, path: String) -> Result<(), String> {
    let p = validate_safe_path(&path)?;
    let dir = if p.is_dir() {
        p
    } else if p.exists() {
        p.parent()
            .map(std::path::Path::to_path_buf)
            .ok_or_else(|| "Path has no parent directory".to_string())?
    } else if let Some(parent) = p.parent() {
        if parent.exists() {
            parent.to_path_buf()
        } else {
            return Err("Directory does not exist".to_string());
        }
    } else {
        return Err("Path does not exist".to_string());
    };
    app.asset_protocol_scope()
        .allow_directory(&dir, true)
        .map_err(|e| format!("Failed to extend asset scope: {e}"))
}

#[tauri::command]
pub async fn close_window(window: tauri::Window) -> Result<(), String> {
    #[cfg(not(target_os = "android"))]
    {
        window.close().map_err(|e| e.to_string())
    }
    #[cfg(target_os = "android")]
    {
        let _ = window;
        Ok(())
    }
}

#[tauri::command]
pub async fn minimize_window(window: tauri::Window) -> Result<(), String> {
    #[cfg(not(target_os = "android"))]
    {
        window.minimize().map_err(|e| e.to_string())
    }
    #[cfg(target_os = "android")]
    {
        let _ = window;
        Ok(())
    }
}

#[tauri::command]
pub async fn toggle_maximize_window(window: tauri::Window) -> Result<(), String> {
    #[cfg(not(target_os = "android"))]
    {
        if window.is_maximized().unwrap_or(false) {
            window.unmaximize().map_err(|e| e.to_string())
        } else {
            window.maximize().map_err(|e| e.to_string())
        }
    }
    #[cfg(target_os = "android")]
    {
        let _ = window;
        Ok(())
    }
}
