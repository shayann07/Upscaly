use tauri::{AppHandle, Emitter};
use std::collections::{VecDeque, HashMap, HashSet};
use std::sync::{Mutex, OnceLock, Arc};
use std::sync::atomic::{AtomicBool, Ordering};
use std::fs;
use std::path::{Path, PathBuf};
use serde::{Serialize, Deserialize};
use std::thread;

use crate::process_runner::{ProcessRunner, StdProcessRunner, ProcessHandle};
use crate::sidecar_manager::resolve_sidecar_path;
use crate::model_manager::get_models_dir;
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

static JOB_QUEUE: OnceLock<Mutex<VecDeque<Job>>> = OnceLock::new();
static ACTIVE_REGISTRY: OnceLock<Mutex<HashMap<String, JobControl>>> = OnceLock::new();
static RESERVED_PATHS: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
static IS_PROCESSING: OnceLock<Mutex<bool>> = OnceLock::new();

fn get_queue() -> &'static Mutex<VecDeque<Job>> {
    JOB_QUEUE.get_or_init(|| Mutex::new(VecDeque::new()))
}

fn get_registry() -> &'static Mutex<HashMap<String, JobControl>> {
    ACTIVE_REGISTRY.get_or_init(|| Mutex::new(HashMap::new()))
}

fn get_reserved_paths() -> &'static Mutex<HashSet<String>> {
    RESERVED_PATHS.get_or_init(|| Mutex::new(HashSet::new()))
}

fn get_is_processing() -> &'static Mutex<bool> {
    IS_PROCESSING.get_or_init(|| Mutex::new(false))
}

/// Reserves a unique output path prior to job enqueueing, avoiding filename collisions.
pub fn reserve_output_path(raw_path: &str) -> String {
    let mut reserved = get_reserved_paths().lock().unwrap();
    let original = PathBuf::from(raw_path);
    let parent = original.parent().unwrap_or_else(|| Path::new("."));
    let stem = original.file_stem().and_then(|s| s.to_str()).unwrap_or("output");
    let ext = original.extension().and_then(|s| s.to_str()).unwrap_or("png");

    let mut candidate = original.to_string_lossy().to_string();
    let mut counter = 1;

    while Path::new(&candidate).exists() || reserved.contains(&candidate) {
        let new_name = format!("{}_{}x ({}).{}", stem, 4, counter, ext);
        candidate = parent.join(new_name).to_string_lossy().to_string();
        counter += 1;
    }

    reserved.insert(candidate.clone());
    candidate
}

pub fn release_output_path(path: &str) {
    let mut reserved = get_reserved_paths().lock().unwrap();
    reserved.remove(path);
}

pub fn add_job_to_queue(app: AppHandle, mut job: Job) {
    // Reserve unique output path
    job.output_path = reserve_output_path(&job.output_path);

    {
        let mut q = get_queue().lock().unwrap();
        q.push_back(job.clone());
    }

    let _ = app.emit("job-status-changed", JobProgress {
        job_id: job.id.clone(),
        percentage: 0.0,
        status: "queued".to_string(),
        error: None,
        phase: Some("Queued in GPU worker pool".to_string()),
        eta_seconds: None,
        fps: None,
        output_path: Some(job.output_path.clone()),
    });

    process_next_job(app);
}

fn process_next_job(app: AppHandle) {
    let mut processing_guard = get_is_processing().lock().unwrap();
    if *processing_guard {
        return;
    }
    *processing_guard = true;
    drop(processing_guard);

    thread::spawn(move || {
        loop {
            let next_job = {
                let mut q = get_queue().lock().unwrap();
                q.pop_front()
            };

            let job = match next_job {
                Some(j) => j,
                None => {
                    let mut lock = get_is_processing().lock().unwrap();
                    *lock = false;
                    break;
                }
            };

            // Setup JobControl in registry immediately before processing
            let cancel_requested = Arc::new(AtomicBool::new(false));
            let process_handle = Arc::new(Mutex::new(None));

            {
                let mut reg = get_registry().lock().unwrap();
                reg.insert(job.id.clone(), JobControl {
                    cancel_requested: Arc::clone(&cancel_requested),
                    process_handle: Arc::clone(&process_handle),
                });
            }

            // Check if job was cancelled while queued
            if cancel_requested.load(Ordering::SeqCst) {
                cleanup_job(&job.id, &job.output_path);
                let _ = app.emit("job-status-changed", JobProgress {
                    job_id: job.id.clone(),
                    percentage: 0.0,
                    status: "cancelled".to_string(),
                    error: None,
                    phase: Some("Cancelled while queued".to_string()),
                    eta_seconds: None,
                    fps: None,
                    output_path: Some(job.output_path.clone()),
                });
                continue;
            }

            let _ = app.emit("job-status-changed", JobProgress {
                job_id: job.id.clone(),
                percentage: 0.0,
                status: "running".to_string(),
                error: None,
                phase: Some("Initializing GPU Pipeline...".to_string()),
                eta_seconds: None,
                fps: None,
                output_path: Some(job.output_path.clone()),
            });

            let res = if job.is_video {
                run_video_job(&app, &job)
            } else {
                run_single_image_job(&app, &job, Arc::clone(&cancel_requested), Arc::clone(&process_handle))
            };

            let is_cancelled = cancel_requested.load(Ordering::SeqCst);
            cleanup_job(&job.id, &job.output_path);

            if is_cancelled {
                let _ = app.emit("job-status-changed", JobProgress {
                    job_id: job.id.clone(),
                    percentage: 0.0,
                    status: "cancelled".to_string(),
                    error: None,
                    phase: Some("Cancelled by user".to_string()),
                    eta_seconds: None,
                    fps: None,
                    output_path: Some(job.output_path.clone()),
                });
            } else {
                match res {
                    Ok(_) => {
                        // Verify non-empty output file
                        let out_path = Path::new(&job.output_path);
                        if out_path.exists() && fs::metadata(out_path).map(|m| m.len() > 0).unwrap_or(false) {
                            let _ = app.emit("job-status-changed", JobProgress {
                                job_id: job.id.clone(),
                                percentage: 100.0,
                                status: "succeeded".to_string(),
                                error: None,
                                phase: Some("Complete".to_string()),
                                eta_seconds: Some(0),
                                fps: None,
                                output_path: Some(job.output_path.clone()),
                            });
                        } else {
                            let _ = app.emit("job-status-changed", JobProgress {
                                job_id: job.id.clone(),
                                percentage: 0.0,
                                status: "failed".to_string(),
                                error: Some("Output file missing or empty after upscale".to_string()),
                                phase: Some("Failed".to_string()),
                                eta_seconds: None,
                                fps: None,
                                output_path: Some(job.output_path.clone()),
                            });
                        }
                    }
                    Err(err) => {
                        let _ = app.emit("job-status-changed", JobProgress {
                            job_id: job.id.clone(),
                            percentage: 0.0,
                            status: "failed".to_string(),
                            error: Some(err),
                            phase: Some("Failed".to_string()),
                            eta_seconds: None,
                            fps: None,
                            output_path: Some(job.output_path.clone()),
                        });
                    }
                }
            }
        }
    });
}


fn cleanup_job(job_id: &str, output_path: &str) {
    let mut reg = get_registry().lock().unwrap();
    reg.remove(job_id);
    release_output_path(output_path);
}

pub fn cancel_job(job_id: &str) -> Result<(), String> {
    // 1. Remove from queue if still queued
    {
        let mut q = get_queue().lock().unwrap();
        q.retain(|j| j.id != job_id);
    }

    // 2. Set cancellation flag and kill active process handle if running
    let reg = get_registry().lock().unwrap();
    if let Some(control) = reg.get(job_id) {
        control.cancel_requested.store(true, Ordering::SeqCst);
        if let Ok(mut handle_guard) = control.process_handle.lock() {
            if let Some(ref mut handle) = *handle_guard {
                let _ = handle.kill();
            }
        }
    }

    Ok(())
}

pub fn kill_all_active_jobs() {
    let mut reg = get_registry().lock().unwrap();
    for (_, control) in reg.drain() {
        control.cancel_requested.store(true, Ordering::SeqCst);
        if let Ok(mut handle_guard) = control.process_handle.lock() {
            if let Some(ref mut handle) = *handle_guard {
                let _ = handle.kill();
            }
        }
    }
}

pub fn normalize_tile_size(user_tile: i32) -> i32 {
    if user_tile <= 0 {
        0
    } else {
        ((user_tile / 32) * 32).clamp(32, 1024)
    }
}

pub fn compute_workload_threads(input_path: &str, is_video: bool) -> &'static str {
    if is_video {
        return "2:2:2";
    }

    if let Ok((width, height)) = image::image_dimensions(input_path) {
        let megapixels = (width as u64 * height as u64) as f64 / 1_000_000.0;
        if megapixels <= 4.0 {
            return "4:4:4";
        } else if megapixels >= 12.0 {
            return "2:2:2";
        } else {
            return "1:2:2";
        }
    }

    "1:2:2"
}

/// Executes a single image upscale job using StdProcessRunner with concurrent stdout/stderr streaming.
fn run_single_image_job(
    app: &AppHandle,
    job: &Job,
    cancel_requested: Arc<AtomicBool>,
    process_handle: Arc<Mutex<Option<Box<dyn ProcessHandle>>>>,
) -> Result<(), String> {
    let sidecar_path = resolve_sidecar_path(app, "realesrgan-ncnn-vulkan")?;
    let models_dir = get_models_dir(app);

    let thread_profile = compute_workload_threads(&job.input_path, job.is_video);
    let tile_size = normalize_tile_size(job.tile_size);

    let args = vec![
        "-i".to_string(), job.input_path.clone(),
        "-o".to_string(), job.output_path.clone(),
        "-n".to_string(), job.model_name.clone(),
        "-m".to_string(), models_dir.to_str().unwrap_or("models").to_string(),
        "-g".to_string(), job.gpu_id.to_string(),
        "-s".to_string(), job.scale.to_string(),
        "-t".to_string(), tile_size.to_string(),
        "-j".to_string(), thread_profile.to_string(),
        "-x".to_string(),
        "-v".to_string(),
    ];


    let runner = StdProcessRunner::new();
    let handle = runner.spawn(&sidecar_path, &args).map_err(|e| e.to_string())?;

    {
        let mut handle_guard = process_handle.lock().unwrap();
        *handle_guard = Some(handle);
    }

    let start_time = std::time::Instant::now();
    let mut current_pct = 10.0f64;

    let _ = app.emit("job-status-changed", JobProgress {
        job_id: job.id.clone(),
        percentage: current_pct,
        status: "running".to_string(),
        error: None,
        phase: Some("GPU Accelerated Upscaling (10.0%)".to_string()),
        eta_seconds: None,
        fps: None,
        output_path: Some(job.output_path.clone()),
    });

    // Poll until completion or cancellation
    loop {
        if cancel_requested.load(Ordering::SeqCst) {
            return Err("cancelled".to_string());
        }

        let mut handle_guard = process_handle.lock().unwrap();
        if let Some(ref mut child) = *handle_guard {
            match child.try_wait() {
                Ok(Some(0)) => break,
                Ok(Some(code)) => return Err(format!("Engine exited with non-zero exit code: {}", code)),
                Ok(None) => {},
                Err(e) => return Err(e.to_string()),
            }
        } else {
            break;
        }
        drop(handle_guard);

        let _elapsed = start_time.elapsed().as_secs_f64();
        current_pct = (current_pct + 8.0).min(95.0);

        let _ = app.emit("job-status-changed", JobProgress {
            job_id: job.id.clone(),
            percentage: current_pct,
            status: "running".to_string(),
            error: None,
            phase: Some(format!("GPU Accelerated Upscaling ({:.1}%)", current_pct)),
            eta_seconds: None,
            fps: None,
            output_path: Some(job.output_path.clone()),
        });

        thread::sleep(std::time::Duration::from_millis(60));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_output_path_reservation_uniqueness() {
        let path1 = reserve_output_path("test_image.png");
        let path2 = reserve_output_path("test_image.png");

        assert_ne!(path1, path2);
        assert!(path2.contains("(1)"));

        release_output_path(&path1);
        release_output_path(&path2);
    }

    #[test]
    fn test_normalize_tile_size() {
        assert_eq!(normalize_tile_size(0), 0);
        assert_eq!(normalize_tile_size(-100), 0);
        assert_eq!(normalize_tile_size(200), 192);
        assert_eq!(normalize_tile_size(2000), 1024);
        assert_eq!(normalize_tile_size(10), 32);
    }

    #[test]
    fn test_compute_workload_threads() {
        assert_eq!(compute_workload_threads("dummy.mp4", true), "2:2:2");
        assert_eq!(compute_workload_threads("nonexistent.png", false), "1:2:2");
    }
}



