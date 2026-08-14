use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet, VecDeque};
use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use tauri::{AppHandle, Emitter};

use crate::job_state::JobState;
use crate::model_manager::get_models_dir;
use crate::output_paths::{release_output_path, reserve_output_path};
use crate::process_runner::{ProcessHandle, ProcessRunner, StdProcessRunner};
use crate::sidecar_manager::resolve_sidecar_path;
use crate::video_pipeline::run_video_job;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Job {
    pub id: String,
    pub input_path: String,
    pub output_path: String,
    pub model_name: String,
    pub gpu_id: i32,
    pub scale: i32,
    pub tile_size: i32,
    pub is_video: bool,
}

/// Restricts a job id to a safe filesystem path component. The id is used to
/// build a temp directory name (`upscaler_job_{id}`) that later gets
/// recursively deleted, so it must never be able to contain path separators
/// or `..` sequences. Anything outside `[A-Za-z0-9_-]` is stripped; if that
/// leaves nothing usable, a fresh id is generated instead of trusting input.
pub fn sanitize_job_id(id: &str) -> String {
    let cleaned: String = id
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-')
        .take(128)
        .collect();

    if cleaned.is_empty() {
        generate_job_id()
    } else {
        cleaned
    }
}

pub fn generate_job_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("job_{nanos:x}")
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct JobProgress {
    pub job_id: String,
    pub percentage: f64,
    pub status: String, // "queued" | "running" | "succeeded" | "failed" | "cancelled"
    pub error: Option<String>,
    pub phase: Option<String>,
    pub eta_seconds: Option<u64>,
    pub fps: Option<f64>,
    pub output_path: Option<String>,
}

pub struct JobControl {
    pub cancel_requested: Arc<AtomicBool>,
    pub process_handle: Arc<Mutex<Option<Box<dyn ProcessHandle>>>>,
}

pub struct JobQueueService {
    queue: Mutex<VecDeque<Job>>,
    registry: Mutex<HashMap<String, JobControl>>,
    is_processing: Mutex<bool>,
    // A job that was popped off `queue` but not yet inserted into
    // `registry` is, for a brief window, in neither -- cancel() would
    // silently no-op and the job would run to completion while the UI
    // believes it was cancelled. Recorded here instead, and consumed by
    // the worker the moment it registers that job id.
    pending_cancellations: Mutex<HashSet<String>>,
}

impl JobQueueService {
    pub fn global() -> &'static Self {
        static INSTANCE: OnceLock<JobQueueService> = OnceLock::new();
        INSTANCE.get_or_init(|| JobQueueService {
            queue: Mutex::new(VecDeque::new()),
            registry: Mutex::new(HashMap::new()),
            is_processing: Mutex::new(false),
            pending_cancellations: Mutex::new(HashSet::new()),
        })
    }

    fn lock_queue(&self) -> std::sync::MutexGuard<'_, VecDeque<Job>> {
        self.queue
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    fn lock_registry(&self) -> std::sync::MutexGuard<'_, HashMap<String, JobControl>> {
        self.registry
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    fn lock_processing(&self) -> std::sync::MutexGuard<'_, bool> {
        self.is_processing
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    fn lock_pending_cancellations(&self) -> std::sync::MutexGuard<'_, HashSet<String>> {
        self.pending_cancellations
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    pub fn enqueue(&self, app: AppHandle, mut job: Job) {
        job.output_path = reserve_output_path(&job.output_path, job.scale as u32);

        {
            let mut q = self.lock_queue();
            q.push_back(job.clone());
        }

        self.emit_progress(
            &app,
            &job.id,
            0.0,
            JobState::Queued,
            Some("Queued in GPU worker pool"),
            None,
            None,
            Some(&job.output_path),
        );
        self.process_next(app);
    }

    pub fn cancel(&self, app: &AppHandle, job_id: &str) -> Result<(), String> {
        let mut was_queued = false;
        let mut output_path = String::new();
        {
            let mut q = self.lock_queue();
            if let Some(pos) = q.iter().position(|j| j.id == job_id) {
                output_path = q[pos].output_path.clone();
                q.remove(pos);
                was_queued = true;
            }
        }

        if was_queued {
            release_output_path(&output_path);
            self.emit_progress(
                app,
                job_id,
                0.0,
                JobState::Cancelled,
                Some("Cancelled while queued"),
                None,
                None,
                Some(&output_path),
            );
            return Ok(());
        }

        let reg = self.lock_registry();
        if let Some(control) = reg.get(job_id) {
            control.cancel_requested.store(true, Ordering::SeqCst);
            if let Ok(mut handle_guard) = control.process_handle.lock() {
                if let Some(ref mut handle) = *handle_guard {
                    let _ = handle.kill();
                }
            }
            return Ok(());
        }
        drop(reg);

        // Neither still queued nor registered as running: the worker most
        // likely popped this job off the queue but hasn't inserted its
        // JobControl yet (a narrow window between the two locks in
        // process_next). Record the cancellation so the worker honors it
        // the instant it registers this job id, instead of silently
        // running the job to completion while the UI believes it was
        // already cancelled.
        let mut pending = self.lock_pending_cancellations();
        pending.insert(job_id.to_string());
        // Defensive cap: a cancel() call for an id that never gets
        // registered (stale/duplicate/typo'd id) would otherwise leak one
        // entry forever. Job ids are unique per run, so this should only
        // ever hold a handful of entries in practice.
        if pending.len() > 64 {
            pending.clear();
            pending.insert(job_id.to_string());
        }

        Ok(())
    }

    pub fn kill_all(&self) {
        let mut reg = self.lock_registry();
        for (_, control) in reg.drain() {
            control.cancel_requested.store(true, Ordering::SeqCst);
            if let Ok(mut handle_guard) = control.process_handle.lock() {
                if let Some(ref mut handle) = *handle_guard {
                    let _ = handle.kill();
                }
            }
        }
    }

    fn cleanup_job(&self, job_id: &str, output_path: &str) {
        let mut reg = self.lock_registry();
        reg.remove(job_id);
        release_output_path(output_path);
    }

    fn process_next(&self, app: AppHandle) {
        let mut processing_guard = self.lock_processing();
        if *processing_guard {
            return;
        }
        *processing_guard = true;
        drop(processing_guard);

        thread::spawn(move || {
            let service = JobQueueService::global();
            loop {
                let next_job = {
                    let mut q = service.lock_queue();
                    q.pop_front()
                };

                let job = match next_job {
                    Some(j) => j,
                    None => {
                        // Decide "stop processing" and "queue is empty" atomically
                        // by holding the processing lock while re-checking the
                        // queue. Without this, a concurrent enqueue() that runs
                        // between our pop_front() returning None and us setting
                        // is_processing = false would see is_processing == true,
                        // skip spawning a new worker, and its job would sit in
                        // the queue forever with nothing left to drain it.
                        let mut processing_lock = service.lock_processing();
                        let q = service.lock_queue();
                        if q.is_empty() {
                            *processing_lock = false;
                            break;
                        }
                        // Something was enqueued in the gap; keep this worker
                        // alive (is_processing stays true) and loop back to
                        // pop it instead of racing a fresh process_next() call.
                        drop(q);
                        drop(processing_lock);
                        continue;
                    }
                };

                // A cancel() call that arrived in the window between this
                // job leaving the queue (above) and being registered
                // (below) recorded itself in pending_cancellations instead
                // of being silently dropped. Consume it now so the
                // existing cancel_requested check right after registration
                // catches it, exactly as if cancel() had found this job
                // already in the registry.
                let already_cancelled = service.lock_pending_cancellations().remove(&job.id);
                let cancel_requested = Arc::new(AtomicBool::new(already_cancelled));
                let process_handle = Arc::new(Mutex::new(None));

                {
                    let mut reg = service.lock_registry();
                    reg.insert(
                        job.id.clone(),
                        JobControl {
                            cancel_requested: Arc::clone(&cancel_requested),
                            process_handle: Arc::clone(&process_handle),
                        },
                    );
                }

                if cancel_requested.load(Ordering::SeqCst) {
                    service.cleanup_job(&job.id, &job.output_path);
                    service.emit_progress(
                        &app,
                        &job.id,
                        0.0,
                        JobState::Cancelled,
                        Some("Cancelled while queued"),
                        None,
                        None,
                        Some(&job.output_path),
                    );
                    continue;
                }

                service.emit_progress(
                    &app,
                    &job.id,
                    0.0,
                    JobState::Running,
                    Some("Initializing GPU Pipeline..."),
                    None,
                    None,
                    Some(&job.output_path),
                );

                let res = if job.is_video {
                    run_video_job(
                        &app,
                        &job,
                        Arc::clone(&cancel_requested),
                        Arc::clone(&process_handle),
                    )
                } else {
                    run_single_image_job(
                        &app,
                        &job,
                        Arc::clone(&cancel_requested),
                        Arc::clone(&process_handle),
                    )
                };

                let is_cancelled = cancel_requested.load(Ordering::SeqCst)
                    || res.as_ref().err().map_or(false, |e| e == "cancelled");
                service.cleanup_job(&job.id, &job.output_path);

                if is_cancelled {
                    let out_path = Path::new(&job.output_path);
                    if out_path.exists() {
                        let _ = fs::remove_file(out_path);
                    }
                    service.emit_progress(
                        &app,
                        &job.id,
                        0.0,
                        JobState::Cancelled,
                        Some("Cancelled by user"),
                        None,
                        None,
                        Some(&job.output_path),
                    );
                } else {
                    match res {
                        Ok(_) => {
                            let out_path = Path::new(&job.output_path);
                            if out_path.exists()
                                && fs::metadata(out_path).map(|m| m.len() > 0).unwrap_or(false)
                            {
                                service.emit_progress(
                                    &app,
                                    &job.id,
                                    100.0,
                                    JobState::Succeeded,
                                    Some("Complete"),
                                    Some(0),
                                    None,
                                    Some(&job.output_path),
                                );
                            } else {
                                if out_path.exists() {
                                    let _ = fs::remove_file(out_path);
                                }
                                service.emit_progress(
                                    &app,
                                    &job.id,
                                    0.0,
                                    JobState::Failed(
                                        "Output file missing or empty after upscale".to_string(),
                                    ),
                                    Some("Failed"),
                                    None,
                                    None,
                                    Some(&job.output_path),
                                );
                            }
                        }
                        Err(err) => {
                            let out_path = Path::new(&job.output_path);
                            if out_path.exists() {
                                let _ = fs::remove_file(out_path);
                            }
                            service.emit_progress(
                                &app,
                                &job.id,
                                0.0,
                                JobState::Failed(err),
                                Some("Failed"),
                                None,
                                None,
                                Some(&job.output_path),
                            );
                        }
                    }
                }
            }
        });
    }

    fn emit_progress(
        &self,
        app: &AppHandle,
        job_id: &str,
        percentage: f64,
        state: JobState,
        phase: Option<&str>,
        eta_seconds: Option<u64>,
        fps: Option<f64>,
        output_path: Option<&str>,
    ) {
        let _ = app.emit(
            "job-status-changed",
            JobProgress {
                job_id: job_id.to_string(),
                percentage,
                status: state.as_str().to_string(),
                error: state.error_message(),
                phase: phase.map(|s| s.to_string()),
                eta_seconds,
                fps,
                output_path: output_path.map(|s| s.to_string()),
            },
        );
    }
}

pub fn add_job_to_queue(app: AppHandle, job: Job) {
    JobQueueService::global().enqueue(app, job);
}

pub fn cancel_job(app: &AppHandle, job_id: &str) -> Result<(), String> {
    JobQueueService::global().cancel(app, job_id)
}

pub fn kill_all_active_jobs() {
    JobQueueService::global().kill_all();
}

pub fn get_gpu_vram_mb_for_id(app: &AppHandle, gpu_id: i32) -> u64 {
    if let Ok(gpus) = crate::sidecar_manager::get_gpu_list(app) {
        if let Some(gpu) = gpus.iter().find(|g| g.id == gpu_id) {
            if gpu.vram_mb > 0 {
                return gpu.vram_mb;
            }
        }
    }
    get_estimated_vram_mb()
}

pub fn get_estimated_vram_mb() -> u64 {
    #[cfg(target_os = "windows")]
    {
        if let Ok(output) = std::process::Command::new("wmic")
            .args(["path", "Win32_VideoController", "get", "AdapterRAM"])
            .output()
        {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                if let Ok(bytes) = line.trim().parse::<u64>() {
                    if bytes > 500_000_000 {
                        return bytes / (1024 * 1024);
                    }
                }
            }
        }
    }
    6144 // Default fallback for modern 6GB GPUs
}

pub fn normalize_tile_size(user_tile: i32) -> i32 {
    let profile = crate::engine::vram_governor::calculate_safe_execution_profile(
        get_estimated_vram_mb(),
        user_tile,
        false,
    );
    profile.tile_size
}

pub fn resolve_effective_scale(
    model_name: &str,
    requested_scale: i32,
    models_dir: Option<&Path>,
) -> i32 {
    let name_lower = model_name.to_lowercase();
    if name_lower.contains("x4") || name_lower.contains("4x") || name_lower.contains("ultra") {
        return 4;
    }
    if name_lower.contains("x3") || name_lower.contains("3x") {
        return 3;
    }
    if name_lower.contains("x2") || name_lower.contains("2x") {
        return 2;
    }

    if let Some(dir) = models_dir {
        let param_path = dir.join(format!("{model_name}.param"));
        if param_path.exists() {
            if let Ok(meta) = crate::engine::model_store::parse_ncnn_param_cached(&param_path) {
                if (2..=4).contains(&meta.scale) {
                    #[allow(clippy::cast_possible_wrap)]
                    return meta.scale as i32;
                }
            }
        }
    }

    if (2..=4).contains(&requested_scale) {
        requested_scale
    } else {
        4
    }
}

pub fn compute_workload_threads(_input_path: &str, _is_video: bool) -> &'static str {
    "1:2:2"
}

fn run_single_image_job(
    app: &AppHandle,
    job: &Job,
    cancel_requested: Arc<AtomicBool>,
    process_handle: Arc<Mutex<Option<Box<dyn ProcessHandle>>>>,
) -> Result<(), String> {
    let sidecar_path = resolve_sidecar_path(app, "realesrgan-ncnn-vulkan")?;
    let models_dir = get_models_dir(app);

    let gpu_vram_mb = get_gpu_vram_mb_for_id(app, job.gpu_id);
    let exec_profile = crate::engine::vram_governor::calculate_safe_execution_profile(
        gpu_vram_mb,
        job.tile_size,
        job.is_video,
    );
    let effective_scale = resolve_effective_scale(&job.model_name, job.scale, Some(&models_dir));

    let args = vec![
        "-i".to_string(),
        job.input_path.clone(),
        "-o".to_string(),
        job.output_path.clone(),
        "-n".to_string(),
        job.model_name.clone(),
        "-m".to_string(),
        models_dir.to_str().unwrap_or("models").to_string(),
        "-g".to_string(),
        job.gpu_id.to_string(),
        "-s".to_string(),
        effective_scale.to_string(),
        "-t".to_string(),
        exec_profile.tile_size.to_string(),
        "-j".to_string(),
        exec_profile.thread_arg.clone(),
        "-v".to_string(),
    ];

    let runner = StdProcessRunner::new();
    let handle = runner
        .spawn(&sidecar_path, &args)
        .map_err(|e| e.to_string())?;

    {
        let mut handle_guard = process_handle.lock().unwrap_or_else(|p| p.into_inner());
        *handle_guard = Some(handle);
    }

    let start_time = std::time::Instant::now();
    let mut current_pct = 0.0f64;

    let _ = app.emit(
        "job-status-changed",
        JobProgress {
            job_id: job.id.clone(),
            percentage: current_pct,
            status: JobState::Running.as_str().to_string(),
            error: None,
            phase: Some("GPU Accelerated Upscaling (0.0%)".to_string()),
            eta_seconds: None,
            fps: None,
            output_path: Some(job.output_path.clone()),
        },
    );

    loop {
        if cancel_requested.load(Ordering::SeqCst) {
            return Err("cancelled".to_string());
        }

        let latest_pct = {
            let mut handle_guard = process_handle.lock().unwrap_or_else(|p| p.into_inner());
            if let Some(ref mut child) = *handle_guard {
                match child.try_wait() {
                    Ok(Some(0)) => {
                        let stderr_log = child.get_stderr_log();
                        if stderr_log.contains("vkAllocateMemory failed")
                            || stderr_log.contains("vkQueueSubmit failed")
                        {
                            return Err("GPU VRAM allocation failed (Vulkan memory overflow). Try selecting a smaller tile size (e.g. 256px or 128px).".to_string());
                        }
                        break;
                    }
                    Ok(Some(code)) => {
                        let stderr_log = child.get_stderr_log();
                        if stderr_log.trim().is_empty() {
                            return Err(format!("Engine exited with non-zero exit code: {code}"));
                        }
                        return Err(format!(
                            "Engine exited with non-zero exit code {code}: {stderr_log}"
                        ));
                    }
                    Ok(None) => child.latest_progress(),
                    Err(e) => return Err(e.to_string()),
                }
            } else {
                break;
            }
        };

        if let Some(real_pct) = latest_pct {
            current_pct = real_pct.clamp(0.0, 99.9);
        }

        let elapsed = start_time.elapsed().as_secs_f64();
        let rate_pct_per_sec = if elapsed > 0.1 && current_pct > 0.0 {
            current_pct / elapsed
        } else {
            0.0
        };
        let remaining_pct = (100.0 - current_pct).max(0.0);
        let eta_secs = if rate_pct_per_sec > 0.01 {
            Some((remaining_pct / rate_pct_per_sec).ceil() as u64)
        } else {
            None
        };

        let _ = app.emit(
            "job-status-changed",
            JobProgress {
                job_id: job.id.clone(),
                percentage: current_pct,
                status: JobState::Running.as_str().to_string(),
                error: None,
                phase: Some(format!("GPU Accelerated Upscaling ({:.1}%)", current_pct)),
                eta_seconds: eta_secs,
                fps: None,
                output_path: Some(job.output_path.clone()),
            },
        );

        thread::sleep(std::time::Duration::from_millis(60));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sanitize_job_id_passes_through_safe_ids() {
        assert_eq!(sanitize_job_id("abc123-XYZ_789"), "abc123-XYZ_789");
    }

    #[test]
    fn test_sanitize_job_id_strips_path_traversal() {
        // The classic escape attempt: strip the traversal components down
        // to only the characters that are safe in a single path segment.
        let sanitized = sanitize_job_id("..\\..\\..\\Users\\shaya\\Documents");
        assert!(!sanitized.contains(".."));
        assert!(!sanitized.contains('\\'));
        assert!(!sanitized.contains('/'));
        assert_eq!(sanitized, "UsersshayaDocuments");
    }

    #[test]
    fn test_sanitize_job_id_strips_unix_path_traversal() {
        let sanitized = sanitize_job_id("../../../etc/passwd");
        assert!(!sanitized.contains(".."));
        assert!(!sanitized.contains('/'));
        assert_eq!(sanitized, "etcpasswd");
    }

    #[test]
    fn test_sanitize_job_id_falls_back_when_fully_unsafe() {
        // An id made entirely of unsafe characters must never resolve to an
        // empty string (which would collapse the temp dir path to just
        // "upscaler_job_") -- it must fall back to a freshly generated id.
        let sanitized = sanitize_job_id("../../../../");
        assert!(!sanitized.is_empty());
        assert!(sanitized
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-'));
    }

    #[test]
    fn test_normalize_tile_size() {
        assert_eq!(normalize_tile_size(0), 0);
        assert_eq!(normalize_tile_size(-100), 0);
        assert_eq!(normalize_tile_size(200), 192);
        assert_eq!(normalize_tile_size(2000), 512); // Safe ceiling on 6GB GPU
        assert_eq!(normalize_tile_size(10), 32);
    }

    #[test]
    fn test_compute_workload_threads() {
        assert_eq!(compute_workload_threads("dummy.mp4", true), "1:2:2");
        assert_eq!(compute_workload_threads("nonexistent.png", false), "1:2:2");
    }

    #[test]
    fn test_job_state_as_str_and_terminal() {
        assert_eq!(JobState::Queued.as_str(), "queued");
        assert_eq!(JobState::Running.as_str(), "running");
        assert_eq!(JobState::Succeeded.as_str(), "succeeded");
        assert_eq!(JobState::Cancelled.as_str(), "cancelled");
        assert_eq!(JobState::Failed("err".into()).as_str(), "failed");

        assert!(!JobState::Queued.is_terminal());
        assert!(!JobState::Running.is_terminal());
        assert!(JobState::Succeeded.is_terminal());
        assert!(JobState::Cancelled.is_terminal());
        assert!(JobState::Failed("err".into()).is_terminal());
    }

    #[test]
    fn test_resolve_effective_scale() {
        assert_eq!(resolve_effective_scale("realesrgan-x4plus", 2, None), 4);
        assert_eq!(
            resolve_effective_scale("realesrgan-x4plus-anime", 2, None),
            4
        );
        assert_eq!(
            resolve_effective_scale("realesr-animevideov3-x2", 4, None),
            2
        );
        assert_eq!(
            resolve_effective_scale("realesr-animevideov3-x3", 4, None),
            3
        );
        assert_eq!(
            resolve_effective_scale("realesr-animevideov3-x4", 2, None),
            4
        );
        assert_eq!(resolve_effective_scale("custom-model-4x", 2, None), 4);
        assert_eq!(resolve_effective_scale("unknown-model", 3, None), 3);
        assert_eq!(resolve_effective_scale("unknown-model", 99, None), 4);
        assert_eq!(resolve_effective_scale("unknown-model", -1, None), 4);
    }
}
