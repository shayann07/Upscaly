//! Durable completion history, owned by the backend.
//!
//! History used to live only in the webview's `localStorage`, written by a
//! React effect when it *observed* a job transition to succeeded. That
//! design records the observation, not the event: a job finishing while the
//! webview was reloading, crashed, or simply not yet mounted wrote nothing,
//! and hours of completed work left no trace in the UI. The failure was
//! invisible by construction -- the output file existed, but nothing
//! remembered producing it.
//!
//! This module appends an entry at the same moment the store knows the job
//! succeeded -- the transition itself -- so the record exists whether or not
//! anything was watching. The frontend still keeps its own copy for entries
//! that predate this file; on launch it merges the two.

use std::fs;
use std::path::PathBuf;

use tauri::AppHandle;

use crate::job_queue::Job;

/// Retention matches the frontend's own cap; entries beyond this are the
/// oldest and drop off the end.
const MAX_ENTRIES: usize = 50;

const HISTORY_FILE: &str = "history.json";

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, ts_rs::TS)]
#[ts(export, export_to = "../../src/lib/ipc/")]
pub struct HistoryRecord {
    pub file_name: String,
    pub input_path: String,
    pub output_path: String,
    pub model_name: String,
    pub scale: i32,
    pub is_video: bool,
    #[ts(type = "number")]
    pub timestamp_ms: u64,
}

fn history_path(app: &AppHandle) -> PathBuf {
    let dir = crate::app_paths::app_data_dir(app);
    let _ = fs::create_dir_all(&dir);
    dir.join(HISTORY_FILE)
}

/// Every recorded completion, newest first. An unreadable or absent file is
/// an empty history, not an error -- there is nothing for a caller to do
/// about it beyond starting fresh.
pub fn load(app: &AppHandle) -> Vec<HistoryRecord> {
    fs::read_to_string(history_path(app))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

/// Records a completed job. Failure is non-fatal by design: the upscale
/// itself succeeded, and refusing to report that because a bookkeeping file
/// could not be written would invert what matters.
pub fn append(app: &AppHandle, job: &Job, timestamp_ms: u64) {
    let file_name = std::path::Path::new(&job.input_path)
        .file_name()
        .map_or_else(|| job.input_path.clone(), |n| n.to_string_lossy().into());

    let mut entries = load(app);
    entries.insert(
        0,
        HistoryRecord {
            file_name,
            input_path: job.input_path.clone(),
            output_path: job.output_path.clone(),
            model_name: job.model_name.clone(),
            scale: job.scale,
            is_video: job.is_video,
            timestamp_ms,
        },
    );
    entries.truncate(MAX_ENTRIES);

    let Ok(json) = serde_json::to_string_pretty(&entries) else {
        return;
    };
    // Same atomic write as settings.json: temp file then rename, so a crash
    // mid-write -- the exact event this history exists to survive -- cannot
    // truncate the file it was updating.
    let path = history_path(app);
    let tmp = path.with_extension("json.tmp");
    if fs::write(&tmp, json).is_ok() {
        let _ = fs::rename(&tmp, &path);
    }
}
