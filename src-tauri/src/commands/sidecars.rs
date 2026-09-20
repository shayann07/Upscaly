#![cfg(feature = "desktop")]

use serde::Serialize;
use std::process::Stdio;
use std::sync::OnceLock;
use tauri::{path::BaseDirectory, AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::sync::Mutex;

/// Progress for the ffmpeg fetch, mirroring `model_manager::DownloadProgress`
/// so the frontend has one shape to reason about for every long download.
/// `total` is 0 when the server sends no Content-Length, which the UI shows
/// as indeterminate rather than inventing a percentage.
#[derive(Debug, Serialize, Clone)]
pub struct FfmpegProgress {
    pub downloaded: u64,
    pub total: u64,
    pub percentage: f64,
    pub step: String,
}

/// Serialises provisioning runs.
///
/// Two callers can ask for ffmpeg at once -- the video queue provisions on
/// demand and the settings pane offers a manual button -- and each used to
/// spawn its own PowerShell run. In the field that meant two concurrent
/// ~290MB downloads, and the loser died moving a file the winner had already
/// placed, surfacing as an "ffmpeg download failed" error over a download
/// that had actually succeeded.
///
/// A later caller now waits for the run in flight instead of starting its
/// own, then finds the binaries already present and returns immediately.
static PROVISION_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

fn already_provisioned(app: &AppHandle) -> bool {
    crate::sidecar_manager::resolve_sidecar_path(app, "ffmpeg").is_ok()
        && crate::sidecar_manager::resolve_sidecar_path(app, "ffprobe").is_ok()
}

/// Parses a `[upscaly:progress] <done> <total>` line from the script.
/// Returns None for every other line, which is left to the log.
fn parse_progress(line: &str) -> Option<(u64, i64)> {
    let rest = line.strip_prefix("[upscaly:progress] ")?;
    let (done, total) = rest.split_once(' ')?;
    Some((done.trim().parse().ok()?, total.trim().parse().ok()?))
}

/// Runs the same provisioning script the installer runs, on demand.
/// Exists because the installer deliberately tolerates a failed fetch
/// (offline install), and the app promises to re-offer the download when
/// a video job needs it.
#[tauri::command]
pub async fn provision_ffmpeg(app: AppHandle) -> Result<(), String> {
    let lock = PROVISION_LOCK.get_or_init(|| Mutex::new(()));
    let _guard = lock.lock().await;

    // Whoever held the lock may have just done the work.
    if already_provisioned(&app) {
        return Ok(());
    }

    let script = app
        .path()
        .resolve("resources/provision-ffmpeg.ps1", BaseDirectory::Resource)
        .map_err(|e| e.to_string())?;
    // Not the exe directory. Under MSIX the app is installed into
    // %ProgramFiles%\WindowsApps, which is read-only even for the
    // installing user, so provisioning next to the exe fails outright and
    // takes every video feature down with it. %LOCALAPPDATA% is writable
    // under both packaging formats, and resolve_sidecar_path() probes it
    // ahead of the exe-relative locations the NSIS installer still uses.
    let install_dir = crate::app_paths::app_local_data_dir(&app);
    std::fs::create_dir_all(&install_dir).map_err(|e| e.to_string())?;

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
    // Piped rather than captured wholesale: the script reports download
    // progress line by line, and waiting for the process to exit before
    // reading any of it is what made a multi-minute download look frozen.
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());
    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to run provisioning: {e}"))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "provisioning produced no stdout".to_string())?;
    // Drained on its own task: a script that writes more than the pipe
    // buffer holds would otherwise block forever waiting for a reader that
    // is itself waiting for the process to exit.
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "provisioning produced no stderr".to_string())?;
    let stderr_task = tokio::spawn(async move {
        let mut buf = String::new();
        let mut lines = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            buf.push_str(&line);
            buf.push('\n');
        }
        buf
    });

    let mut collected = String::new();
    let mut last_step = String::from("Downloading ffmpeg");
    let mut lines = BufReader::new(stdout).lines();
    while let Ok(Some(line)) = lines.next_line().await {
        if let Some((downloaded, total)) = parse_progress(&line) {
            let total_u = total.max(0) as u64;
            let percentage = if total_u > 0 {
                (downloaded as f64 / total_u as f64) * 100.0
            } else {
                0.0
            };
            let _ = app.emit(
                "ffmpeg-progress",
                FfmpegProgress {
                    downloaded,
                    total: total_u,
                    percentage,
                    step: last_step.clone(),
                },
            );
            continue;
        }
        if let Some(step) = line.strip_prefix("[upscaly] ") {
            last_step = step.trim().to_string();
            tracing::info!(step = %last_step, "ffmpeg provisioning");
        }
        collected.push_str(&line);
        collected.push('\n');
    }

    let status = child
        .wait()
        .await
        .map_err(|e| format!("Failed to run provisioning: {e}"))?;
    let stderr_out = stderr_task.await.unwrap_or_default();

    if status.success() {
        Ok(())
    } else {
        let detail = if !stderr_out.trim().is_empty() {
            stderr_out.trim().to_string()
        } else if !collected.trim().is_empty() {
            collected.trim().to_string()
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
