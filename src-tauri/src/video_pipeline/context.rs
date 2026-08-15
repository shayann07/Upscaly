use crate::job_queue::{sanitize_job_id, Job, JobProgress};
use crate::process_runner::{MultiProcessHandle, ProcessHandle};
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

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
    ) -> Result<(Self, TempFolderGuard), String> {
        let cache_dir = app
            .path()
            .app_cache_dir()
            .unwrap_or_else(|_| PathBuf::from("."));
        // Defense in depth: re-sanitize here too, at the point where the
        // resulting path is recursively deleted, regardless of whether the
        // caller already validated `job.id`.
        let safe_job_id = sanitize_job_id(&job.id);
        let job_temp_dir = cache_dir.join(format!("upscaler_job_{safe_job_id}"));

        // Belt-and-suspenders: the sanitized id can only ever produce a
        // direct child of cache_dir, but verify that invariant explicitly
        // before anything gets deleted.
        if job_temp_dir.parent() != Some(cache_dir.as_path()) {
            return Err("Invalid job id: refusing to build an unsafe temp path".to_string());
        }

        let guard = TempFolderGuard(job_temp_dir.clone());

        let staging_dir = job_temp_dir.join("staging");
        let frames_out_dir = job_temp_dir.join("frames_out");

        let _ = fs::remove_dir_all(&job_temp_dir);
        fs::create_dir_all(&staging_dir)
            .map_err(|e| format!("Failed to create staging frames folder: {e}"))?;
        fs::create_dir_all(&frames_out_dir)
            .map_err(|e| format!("Failed to create output frames folder: {e}"))?;

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

    pub fn emit_progress_with_meta(
        &self,
        percentage: f64,
        phase_text: &str,
        eta_seconds: Option<u64>,
        fps: Option<f64>,
    ) {
        let _ = self.app.emit(
            "job-status-changed",
            JobProgress {
                job_id: self.job.id.clone(),
                percentage,
                status: "running".to_string(),
                error: None,
                phase: Some(phase_text.to_string()),
                eta_seconds,
                fps,
                output_path: Some(self.job.output_path.clone()),
            },
        );
    }
}
