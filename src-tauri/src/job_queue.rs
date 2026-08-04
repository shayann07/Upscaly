use tauri::{AppHandle, Emitter};
use std::collections::HashMap;
use std::process::{Command, Stdio, Child};
use std::sync::{Mutex, OnceLock};
use std::io::{BufReader, BufRead};
use serde::{Serialize, Deserialize};
use std::thread;
use std::time::Instant;
use crate::sidecar_manager::{resolve_sidecar_path, attach_to_job_object};
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
    pub status: String,
    pub error: Option<String>,
    pub phase: Option<String>,
    pub eta_seconds: Option<u64>,
    pub fps: Option<f64>,
}

static JOB_QUEUE: OnceLock<Mutex<Vec<Job>>> = OnceLock::new();
static ACTIVE_JOBS: OnceLock<Mutex<HashMap<String, Child>>> = OnceLock::new();
static IS_PROCESSING: OnceLock<Mutex<bool>> = OnceLock::new();

fn get_queue() -> &'static Mutex<Vec<Job>> {
    JOB_QUEUE.get_or_init(|| Mutex::new(Vec::new()))
}

fn get_active_jobs() -> &'static Mutex<HashMap<String, Child>> {
    ACTIVE_JOBS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn get_is_processing() -> &'static Mutex<bool> {
    IS_PROCESSING.get_or_init(|| Mutex::new(false))
}

pub fn add_job_to_queue(app: AppHandle, job: Job) {
    {
        let mut q = get_queue().lock().unwrap();
        q.push(job.clone());
    }

    let _ = app.emit("job-status-changed", JobProgress {
        job_id: job.id.clone(),
        percentage: 0.0,
        status: "queued".to_string(),
        error: None,
        phase: Some("Queued in GPU worker pool...".to_string()),
        eta_seconds: None,
        fps: None,
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
                if q.is_empty() {
                    None
                } else {
                    Some(q.remove(0))
                }
            };

            let job = match next_job {
                Some(j) => j,
                None => {
                    let mut lock = get_is_processing().lock().unwrap();
                    *lock = false;
                    break;
                }
            };

            let _ = app.emit("job-status-changed", JobProgress {
                job_id: job.id.clone(),
                percentage: 0.0,
                status: "processing".to_string(),
                error: None,
                phase: Some("Initializing GPU Pipeline...".to_string()),
                eta_seconds: None,
                fps: None,
            });

            let res = if job.is_video {
                run_video_job(&app, &job)
            } else {
                run_single_image_job(&app, &job)
            };

            match res {
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
                    let _ = app.emit("job-status-changed", JobProgress {
                        job_id: job.id.clone(),
                        percentage: 0.0,
                        status: status.to_string(),
                        error: Some(err),
                        phase: Some("Failed".to_string()),
                        eta_seconds: None,
                        fps: None,
                    });
                }
            }
        }
    });
}

pub fn cancel_job(job_id: &str) -> Result<(), String> {
    {
        let mut q = get_queue().lock().unwrap();
        q.retain(|j| j.id != job_id);
    }

    let mut active = get_active_jobs().lock().unwrap();
    if let Some(mut child) = active.remove(job_id) {
        let _ = child.kill();
        return Ok(());
    }

    Ok(())
}

pub fn kill_all_active_jobs() {
    let mut active = get_active_jobs().lock().unwrap();
    for (_, mut child) in active.drain() {
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
        "-j", "4:4:4",
        "-x",
        "-v"
    ]);

    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| format!("Failed to start upscale process: {}", e))?;
    attach_to_job_object(&child);

    let start_time = Instant::now();

    if let Some(stderr) = child.stderr.take() {
        let reader = BufReader::new(stderr);
        for line_res in reader.lines() {
            let line = match line_res {
                Ok(l) => l,
                Err(_) => break,
            };

            if line.ends_with('%') {
                let num_part = line.trim_end_matches('%');
                if let Ok(val) = num_part.parse::<f64>() {
                    let elapsed = start_time.elapsed().as_secs_f64();
                    let (eta_sec, current_fps) = if val > 0.5 && elapsed > 0.2 {
                        let total_est = elapsed / (val / 100.0);
                        let remaining = (total_est - elapsed).max(0.0) as u64;
                        let rate = (val / 100.0) / elapsed;
                        (Some(remaining), Some((rate * 10.0).round() / 10.0))
                    } else {
                        (None, None)
                    };

                    let _ = app.emit("job-status-changed", JobProgress {
                        job_id: job.id.clone(),
                        percentage: val,
                        status: "processing".to_string(),
                        error: None,
                        phase: Some(format!("GPU Inference ({:.1}%)", val)),
                        eta_seconds: eta_sec,
                        fps: current_fps,
                    });
                }
            }
        }
    }

    {
        let mut active_jobs = get_active_jobs().lock().unwrap();
        active_jobs.insert(job.id.clone(), child);
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
        Ok(())
    }
}
