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
pub async fn check_file_exists(path: String) -> Result<bool, String> {
    let p = validate_safe_path(&path)?;
    Ok(p.exists() && p.is_file())
}

#[tauri::command]
pub async fn open_file_native(path: String) -> Result<(), String> {
    let p = validate_safe_path(&path)?;
    let clean_path = p.to_string_lossy().to_string();

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(&["/c", "start", "", &clean_path])
            .spawn()
            .map_err(|e| format!("Failed to open file: {}", e))?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        open::that(&clean_path).map_err(|e| format!("Failed to open file: {}", e))
    }
}

#[tauri::command]
pub async fn show_in_explorer_native(path: String) -> Result<(), String> {
    let p = validate_safe_path(&path)?;
    let clean_path = p.to_string_lossy().to_string();

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .args(&["/select,", &clean_path])
            .spawn()
            .map_err(|e| format!("Failed to open explorer: {}", e))?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        open::that(&clean_path).map_err(|e| format!("Failed to open folder: {}", e))
    }
}

#[tauri::command]
pub async fn close_window(window: tauri::Window) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn minimize_window(window: tauri::Window) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn toggle_maximize_window(window: tauri::Window) -> Result<(), String> {
    if window.is_maximized().unwrap_or(false) {
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub async fn get_file_size_bytes(path: String) -> Result<u64, String> {
    let p = validate_safe_path(&path)?;
    let meta = std::fs::metadata(&p).map_err(|e| format!("Failed to read file metadata: {e}"))?;
    Ok(meta.len())
}
