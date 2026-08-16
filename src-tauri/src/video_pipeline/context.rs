use crate::error::AppError;
use crate::job_queue::{sanitize_job_id, Job};
use crate::job_store::JobStore;
use crate::process_runner::{MultiProcessHandle, ProcessHandle};
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use std::sync::Mutex;
use tauri::AppHandle;

/// RAII Guard for temporary job directories to guarantee cleanup on success, failure, or cancellation.
pub struct TempFolderGuard(pub PathBuf);

impl Drop for TempFolderGuard {
    fn drop(&mut self) {
        if self.0.exists() {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
}

pub struct VideoJobContext<'a> {
    pub app: &'a AppHandle,
    pub job: &'a Job,
    pub cancel_requested: Arc<AtomicBool>,
    pub process_handle: Arc<Mutex<Option<Box<dyn ProcessHandle>>>>,
    pub active_handles: Arc<Mutex<Vec<Box<dyn ProcessHandle>>>>,
    pub job_temp_dir: PathBuf,
    pub staging_dir: PathBuf,
    pub frames_out_dir: PathBuf,
}

impl<'a> VideoJobContext<'a> {
    pub fn new(
        app: &'a AppHandle,
        job: &'a Job,
        cancel_requested: Arc<AtomicBool>,
        process_handle: Arc<Mutex<Option<Box<dyn ProcessHandle>>>>,
    ) -> Result<(Self, TempFolderGuard), AppError> {
        let cache_dir = crate::app_paths::app_cache_dir(app);
        // Defense in depth: re-sanitize here too, at the point where the
        // resulting path is recursively deleted, regardless of whether the
        // caller already validated `job.id`.
        let safe_job_id = sanitize_job_id(&job.id);
        let job_temp_dir = cache_dir.join(format!("upscaler_job_{safe_job_id}"));

        // Belt-and-suspenders: the sanitized id can only ever produce a
        // direct child of cache_dir, but verify that invariant explicitly
        // before anything gets deleted.
        if job_temp_dir.parent() != Some(cache_dir.as_path()) {
            return Err(AppError::exec(
                "Invalid job id: refusing to build an unsafe temp path",
            ));
        }

        let guard = TempFolderGuard(job_temp_dir.clone());

        let staging_dir = job_temp_dir.join("staging");
        let frames_out_dir = job_temp_dir.join("frames_out");

        if job.resume {
            // A resume's whole value is the completed frames already in
            // frames_out, so only the re-derivable state is discarded:
            // staged source frames (extraction re-runs from the video and
            // produces identical names) and any half-populated batch dirs.
            // Partial outputs from the crash itself were already deleted by
            // the resume scan, and are deleted again here in case the scan
            // ran in an earlier app session.
            let _ = fs::remove_dir_all(&staging_dir);
            if let Ok(entries) = fs::read_dir(&job_temp_dir) {
                for entry in entries.flatten() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if name.starts_with("batch_") {
                        let _ = fs::remove_dir_all(entry.path());
                    }
                }
            }
            crate::video_pipeline::resume::verified_frame_count(&frames_out_dir);
        } else {
            let _ = fs::remove_dir_all(&job_temp_dir);
        }
        fs::create_dir_all(&staging_dir)
            .map_err(|e| AppError::exec(format!("Failed to create staging frames folder: {e}")))?;
        fs::create_dir_all(&frames_out_dir)
            .map_err(|e| AppError::exec(format!("Failed to create output frames folder: {e}")))?;

        // From this moment the folder is identifiable as resumable
        // work-in-progress. Written before any frame exists on purpose: a
        // crash during extraction still leaves a valid manifest, it just
        // yields zero verified frames and gets cleaned by the next scan.
        crate::video_pipeline::resume::write_manifest(&job_temp_dir, job);

        let active_handles = Arc::new(Mutex::new(Vec::new()));

        {
            let mut handle_guard = process_handle
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            *handle_guard = Some(Box::new(MultiProcessHandle::new(Arc::clone(
                &active_handles,
            ))));
        }

        let context = Self {
            app,
            job,
            cancel_requested,
            process_handle,
            active_handles,
            job_temp_dir,
            staging_dir,
            frames_out_dir,
        };

        Ok((context, guard))
    }

    pub fn register_handle(&self, handle: Box<dyn ProcessHandle>) {
        let mut list = self
            .active_handles
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        list.push(handle);
    }

    pub fn unregister_handle(&self, id: u32) {
        let mut list = self
            .active_handles
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        list.retain(|h| h.id() != id);
    }

    pub fn is_cancelled(&self) -> bool {
        self.cancel_requested
            .load(std::sync::atomic::Ordering::SeqCst)
    }

    pub fn emit_progress(&self, percentage: f64, phase_text: &str) {
        self.emit_progress_with_meta(percentage, phase_text, None, None);
    }

    /// Reports pipeline progress into the job store.
    ///
    /// This used to emit a `job-status-changed` event per call, restating
    /// the job's whole status (including a hardcoded `"running"`) on every
    /// tick. The store owns the state now; this only contributes the
    /// measurements, and the store decides when they reach the webview.
    pub fn emit_progress_with_meta(
        &self,
        percentage: f64,
        phase_text: &str,
        eta_seconds: Option<u64>,
        fps: Option<f64>,
    ) {
        JobStore::global().update_progress(
            self.app,
            &self.job.id,
            percentage,
            Some(phase_text),
            eta_seconds,
            fps,
        );
    }
}
