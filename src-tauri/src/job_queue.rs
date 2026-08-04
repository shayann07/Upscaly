use tauri::{AppHandle, Emitter};
use std::process::{Command, Stdio, Child};
use std::sync::{Mutex, OnceLock};
use std::collections::{HashMap, VecDeque};
use std::io::{BufReader, BufRead};
use serde::{Serialize, Deserialize};
use std::thread;

use crate::sidecar_manager::{resolve_sidecar_path, attach_to_job_object};
use crate::model_manager::get_models_dir;

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
    pub status: String, // "queued", "processing", "completed", "failed", "cancelled"
    pub error: Option<String>,
    pub phase: Option<String>,
    pub eta_seconds: Option<u64>,
    pub fps: Option<f64>,
}

static JOB_QUEUE: OnceLock<Mutex<VecDeque<Job>>> = OnceLock::new();
static ACTIVE_JOBS: OnceLock<Mutex<HashMap<String, Child>>> = OnceLock::new();
static WORKER_RUNNING: OnceLock<Mutex<bool>> = OnceLock::new();

fn get_job_queue() -> &'static Mutex<VecDeque<Job>> {
    JOB_QUEUE.get_or_init(|| Mutex::new(VecDeque::new()))
}

fn get_active_jobs() -> &'static Mutex<HashMap<String, Child>> {
    ACTIVE_JOBS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn get_worker_running() -> &'static Mutex<bool> {
    WORKER_RUNNING.get_or_init(|| Mutex::new(false))
}

/// Spawns the worker thread if it is not already running.
pub fn start_queue_worker(app: AppHandle) {
    let mut running = get_worker_running().lock().unwrap();
    if *running {
        return;
    }
    *running = true;

    thread::spawn(move || {
        loop {
            let next_job = {
                let mut queue = get_job_queue().lock().unwrap();
                queue.pop_front()
            };

            match next_job {
                Some(job) => {
                    let _ = app.emit("job-status-changed", JobProgress {
                        job_id: job.id.clone(),
                        percentage: 0.0,
                        status: "processing".to_string(),
                        error: None,
                        phase: Some("Initializing GPU Engine...".to_string()),
                        eta_seconds: None,
                        fps: None,
                    });

                    let result = if job.is_video {
                        crate::video_pipeline::run_video_job(&app, &job)
                    } else {
                        run_single_image_job(&app, &job)
                    };

                    match result {
                        Ok(_) => {
                            let _ = app.emit("job-status-changed", JobProgress {
                                job_id: job.id.clone(),
                                percentage: 100.0,
                                status: "completed".to_string(),
                                error: None,
                                phase: Some("Complete".to_string()),
                                eta_seconds: Some(0),
                                fps: None,
                            });
                        }
                        Err(err) => {
                            let status = if err == "cancelled" { "cancelled" } else { "failed" };
                            let error_msg = if err == "cancelled" { None } else { Some(err) };
                            
                            let _ = app.emit("job-status-changed", JobProgress {
                                job_id: job.id.clone(),
                                percentage: 0.0,
                                status: status.to_string(),
                                error: error_msg,
                                phase: Some("Failed".to_string()),
                                eta_seconds: None,
                                fps: None,
                            });
                        }
                    }

                    // Ensure job is removed from active map
                    let mut active_jobs = get_active_jobs().lock().unwrap();
                    active_jobs.remove(&job.id);
                }
                None => {
                    let mut running = get_worker_running().lock().unwrap();
                    *running = false;
                    break;
                }
            }
        }
    });
}

/// Adds a job to the background processing queue and starts the worker.
pub fn add_job_to_queue(app: AppHandle, job: Job) {
    {
        let mut queue = get_job_queue().lock().unwrap();
        queue.push_back(job.clone());
    }

    let _ = app.emit("job-status-changed", JobProgress {
        job_id: job.id,
        percentage: 0.0,
        status: "queued".to_string(),
        error: None,
        phase: Some("Queued in GPU worker thread...".to_string()),
        eta_seconds: None,
        fps: None,
    });

    start_queue_worker(app);
}

/// Cancels a running or queued job.
pub fn cancel_job(job_id: &str) -> Result<(), String> {
    {
        let mut queue = get_job_queue().lock().unwrap();
        if let Some(pos) = queue.iter().position(|j| j.id == job_id) {
            queue.remove(pos);
            return Ok(());
        }
    }

    {
        let mut active_jobs = get_active_jobs().lock().unwrap();
        if let Some(mut child) = active_jobs.remove(job_id) {
            let _ = child.kill();
            return Ok(());
        }
    }

    Ok(())
}

/// Forcefully terminates all active jobs (e.g. on window exit)
pub fn kill_all_active_jobs() {
    let mut active_jobs = get_active_jobs().lock().unwrap();
    for (_, mut child) in active_jobs.drain() {
        let _ = child.kill();
    }
}

/// Executes a single image upscale job by calling the NCNN Vulkan binary and parsing progress.
fn run_single_image_job(app: &AppHandle, job: &Job) -> Result<(), String> {
    let sidecar_path = resolve_sidecar_path(app, "realesrgan-ncnn-vulkan")?;
    let models_dir = get_models_dir(app);

    let mut cmd = Command::new(sidecar_path);
    cmd.args(&[
        "-i", &job.input_path,
        "-o", &job.output_path,
        "-n", &job.model_name,
        "-m", models_dir.to_str().unwrap_or("models"),
        "-g", &job.gpu_id.to_string(),
        "-s", &job.scale.to_string(),
        "-t", &job.tile_size.to_string(),
        "-v"
    ]);

    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let child = cmd.spawn().map_err(|e| format!("Failed to start upscale process: {}", e))?;
    attach_to_job_object(&child);

    {
        let mut active_jobs = get_active_jobs().lock().unwrap();
        active_jobs.insert(job.id.clone(), child);
    }

    if let Some(stderr) = get_active_jobs().lock().unwrap().get_mut(&job.id).and_then(|c| c.stderr.take()) {
        let reader = BufReader::new(stderr);
        for line_res in reader.lines() {
            let line = match line_res {
                Ok(l) => l,
                Err(_) => break,
            };

            if line.ends_with('%') {
                let num_part = line.trim_end_matches('%');
                if let Ok(val) = num_part.parse::<f64>() {
                    let _ = app.emit("job-status-changed", JobProgress {
                        job_id: job.id.clone(),
                        percentage: val,
                        status: "processing".to_string(),
                        error: None,
                        phase: Some("GPU Inference...".to_string()),
                        eta_seconds: None,
                        fps: None,
                    });
                }
            }
        }
    }

    let mut active_jobs = get_active_jobs().lock().unwrap();
    if let Some(mut child) = active_jobs.remove(&job.id) {
        let status = child.wait().map_err(|e| e.to_string())?;
        if status.success() {
            Ok(())
        } else {
            if active_jobs.contains_key(&job.id) {
                Err("Upscale engine failed or exited with error".to_string())
            } else {
                Err("cancelled".to_string())
            }
        }
    } else {
        Err("cancelled".to_string())
    }
}
