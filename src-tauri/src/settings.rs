use tauri::{AppHandle, Manager};
use serde::{Serialize, Deserialize};
use std::path::PathBuf;
use std::fs;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppSettings {
    pub default_gpu_id: i32,
    pub default_scale: i32,
    pub default_tile_size: u32,
    pub output_directory: Option<String>,
    pub sound_muted: bool,
    pub auto_check_updates: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            default_gpu_id: 0,
            default_scale: 4,
            default_tile_size: 0,
            output_directory: None,
            sound_muted: false,
            auto_check_updates: true,
        }
    }
}

pub fn get_settings_path(app: &AppHandle) -> PathBuf {
    let app_dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    if !app_dir.exists() {
        let _ = fs::create_dir_all(&app_dir);
    }
    app_dir.join("settings.json")
}

pub fn load_settings(app: &AppHandle) -> AppSettings {
    let path = get_settings_path(app);
    if path.exists() {
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(settings) = serde_json::from_str::<AppSettings>(&content) {
                return settings;
            }
        }
    }
    AppSettings::default()
}

pub fn save_settings(app: &AppHandle, settings: &AppSettings) -> Result<(), String> {
    let path = get_settings_path(app);
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_app_settings_default() {
        let defaults = AppSettings::default();
        assert_eq!(defaults.default_gpu_id, 0);
        assert_eq!(defaults.default_scale, 4);
        assert_eq!(defaults.default_tile_size, 0);
        assert_eq!(defaults.sound_muted, false);
    }

    #[test]
    fn test_app_settings_json_roundtrip() {
        let mut settings = AppSettings::default();
        settings.sound_muted = true;
        settings.default_scale = 2;

        let json = serde_json::to_string(&settings).unwrap();
        let parsed: AppSettings = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.sound_muted, true);
        assert_eq!(parsed.default_scale, 2);
    }
}
