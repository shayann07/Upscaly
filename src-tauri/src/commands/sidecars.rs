#![cfg(feature = "desktop")]

use tauri::{path::BaseDirectory, AppHandle, Manager};

/// Runs the same provisioning script the installer runs, on demand.
/// Exists because the installer deliberately tolerates a failed fetch
/// (offline install), and the app promises to re-offer the download when
/// a video job needs it.
#[tauri::command]
pub async fn provision_ffmpeg(app: AppHandle) -> Result<(), String> {
    let script = app
        .path()
        .resolve("resources/provision-ffmpeg.ps1", BaseDirectory::Resource)
        .map_err(|e| e.to_string())?;
    let install_dir = std::env::current_exe()
        .map_err(|e| e.to_string())?
        .parent()
        .ok_or_else(|| "no exe dir".to_string())?
        .to_path_buf();
    let mut cmd = tokio::process::Command::new("powershell.exe");
    cmd.args([
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        &script.to_string_lossy(),
        "-InstallDir",
        &install_dir.to_string_lossy(),
    ]);
    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Failed to run provisioning: {e}"))?;
    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let detail = if !stderr.trim().is_empty() {
            stderr.trim().to_string()
        } else if !stdout.trim().is_empty() {
            stdout.trim().to_string()
        } else {
            "Unknown provisioning error".to_string()
        };
        Err(format!("ffmpeg download failed: {detail}"))
    }
}

/// Checks whether ffmpeg can be resolved on the current system.
#[tauri::command]
pub async fn ffmpeg_available(app: AppHandle) -> bool {
    crate::sidecar_manager::resolve_sidecar_path(&app, "ffmpeg").is_ok()
}
