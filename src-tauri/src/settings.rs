use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Serialize, Deserialize, Clone, ts_rs::TS)]
#[ts(export, export_to = "../../src/lib/ipc/")]
pub struct AppSettings {
    /// The Vulkan device index chosen last time.
    ///
    /// Retained for display and as a hint only. It must never be the thing
    /// that decides which card runs a job: Vulkan's enumeration order is not
    /// stable across launches on hybrid laptops. On the development machine
    /// the same two devices enumerated `[0 NVIDIA][1 Intel]` and, minutes
    /// later, `[0 Intel][1 NVIDIA]` -- so a saved "0" meaning the discrete
    /// card silently came to mean the iGPU. `default_gpu_name` is the field
    /// that survives that; see `resolveGpu` on the frontend.
    pub default_gpu_id: i32,
    /// The name of the device chosen last time, matched against a fresh
    /// enumeration at startup. `None` for settings files written before this
    /// field existed.
    #[serde(default)]
    pub default_gpu_name: Option<String>,
    pub default_scale: i32,
    pub default_tile_size: u32,
    #[serde(default)]
    pub default_preset: crate::engine::preset::QualityPreset,
    #[serde(default)]
    pub default_output_format: crate::engine::output_format::OutputFormat,
    pub output_directory: Option<String>,
    pub sound_muted: bool,
    pub auto_check_updates: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            default_gpu_id: 0,
            default_gpu_name: None,
            default_scale: 4,
            default_tile_size: 0,
            default_preset: crate::engine::preset::QualityPreset::Balanced,
            default_output_format: crate::engine::output_format::OutputFormat::Png,
            output_directory: None,
            sound_muted: false,
            auto_check_updates: true,
        }
    }
}

pub fn get_settings_path(app: &AppHandle) -> PathBuf {
    let app_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
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
            // Preserve the unreadable file instead of silently discarding
            // the user's saved preferences (GPU choice, output directory,
            // mute state) -- the next save would otherwise overwrite it
            // with fresh defaults with no trace of what was there before.
            let backup_path = path.with_extension("json.corrupt");
            let _ = fs::rename(&path, &backup_path);
        }
    }
    AppSettings::default()
}

pub fn save_settings(app: &AppHandle, settings: &AppSettings) -> Result<(), String> {
    let path = get_settings_path(app);
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;

    // Write to a temp file and rename into place instead of truncating
    // settings.json directly -- a crash or power loss mid-write previously
    // left a truncated/corrupt file, which load_settings could only
    // recover from by resetting to defaults.
    let tmp_path = path.with_extension("json.tmp");
    fs::write(&tmp_path, json).map_err(|e| e.to_string())?;
    fs::rename(&tmp_path, &path).map_err(|e| e.to_string())
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
        assert!(!defaults.sound_muted);
    }

    #[test]
    fn test_settings_written_before_gpu_name_existed_still_load() {
        // Without #[serde(default)] on the new field this fails to
        // deserialize, and load_settings responds by renaming the file to
        // .corrupt and returning defaults -- silently discarding the user's
        // output directory, scale and tile preferences on upgrade.
        let legacy = r#"{
            "default_gpu_id": 1,
            "default_scale": 2,
            "default_tile_size": 256,
            "output_directory": "D:/out",
            "sound_muted": true,
            "auto_check_updates": false
        }"#;

        let parsed: AppSettings = serde_json::from_str(legacy).unwrap();
        assert_eq!(parsed.default_gpu_name, None);
        // Never the 8x preset by default -- an upgrade must not silently
        // make every job eight times slower.
        assert_eq!(
            parsed.default_preset,
            crate::engine::preset::QualityPreset::Balanced
        );
        // And never a lossy container by default -- an upgrade must not
        // start re-encoding results the user expects to be lossless.
        assert_eq!(
            parsed.default_output_format,
            crate::engine::output_format::OutputFormat::Png
        );
        assert_eq!(parsed.default_scale, 2);
        assert_eq!(parsed.output_directory.as_deref(), Some("D:/out"));
    }

    #[test]
    fn test_app_settings_json_roundtrip() {
        let settings = AppSettings {
            sound_muted: true,
            default_scale: 2,
            ..AppSettings::default()
        };

        let json = serde_json::to_string(&settings).unwrap();
        let parsed: AppSettings = serde_json::from_str(&json).unwrap();

        assert!(parsed.sound_muted);
        assert_eq!(parsed.default_scale, 2);
    }
}
