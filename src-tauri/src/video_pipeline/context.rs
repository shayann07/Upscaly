use crate::job_queue::{Job, JobProgress};
use crate::process_runner::ProcessHandle;
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
    pub job_temp_dir: PathBuf,
    pub frames_in_dir: PathBuf,
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
        let job_temp_dir = cache_dir.join(format!("upscaler_job_{}", job.id));
        let guard = TempFolderGuard(job_temp_dir.clone());

        let frames_in_dir = job_temp_dir.join("frames_in");
        let frames_out_dir = job_temp_dir.join("frames_out");

        let _ = fs::remove_dir_all(&job_temp_dir);
        fs::create_dir_all(&frames_in_dir)
            .map_err(|e| format!("Failed to create input frames folder: {}", e))?;
        fs::create_dir_all(&frames_out_dir)
            .map_err(|e| format!("Failed to create output frames folder: {}", e))?;

        let context = Self {
            app,
            job,
            cancel_requested,
            process_handle,
            job_temp_dir,
            frames_in_dir,
            frames_out_dir,
        };

        Ok((context, guard))
    }

    pub fn is_cancelled(&self) -> bool {
        self.cancel_requested
            .load(std::sync::atomic::Ordering::SeqCst)
    }

    pub fn emit_progress(&self, percentage: f64, phase_text: &str) {
        let _ = self.app.emit(
            "job-status-changed",
            JobProgress {
                job_id: self.job.id.clone(),
                percentage,
                status: "processing".to_string(),
                error: None,
                phase: Some(phase_text.to_string()),
                eta_seconds: None,
                fps: None,
                output_path: None,
            },
        );
    }
}
