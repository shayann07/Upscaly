use tauri::{AppHandle, Manager, Emitter};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::fs;
use std::thread;
use std::time::Duration;
use crate::sidecar_manager::resolve_sidecar_path;
use crate::model_manager::get_models_dir;
use crate::job_queue::{Job, JobProgress};

/// RAII Guard for temporary job directories to guarantee cleanup on success, failure, or cancellation.
pub struct TempFolderGuard(pub PathBuf);

impl Drop for TempFolderGuard {
    fn drop(&mut self) {
        if self.0.exists() {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
}

/// Orchestrates the entire video upscaling pipeline.
pub fn run_video_job(app: &AppHandle, job: &Job) -> Result<(), String> {
    // 1. Create temporary directories
    let cache_dir = app.path().app_cache_dir().unwrap_or_else(|_| PathBuf::from("."));
    let job_temp_dir = cache_dir.join(format!("upscaler_job_{}", job.id));
    let _guard = TempFolderGuard(job_temp_dir.clone());

    let frames_in_dir = job_temp_dir.join("frames_in");
    let frames_out_dir = job_temp_dir.join("frames_out");

    // Clean up any stale directory from previous attempts
    let _ = fs::remove_dir_all(&job_temp_dir);
    fs::create_dir_all(&frames_in_dir).map_err(|e| format!("Failed to create input frames folder: {}", e))?;
    fs::create_dir_all(&frames_out_dir).map_err(|e| format!("Failed to create output frames folder: {}", e))?;

    // 2. Query original video framerate (with safe fallback)
    let fps_string = get_video_framerate(app, &job.input_path);

    // 3. Extract video frames using multi-threaded FFmpeg
    update_progress(app, &job.id, 2.0, "Extracting Video Frames (FFmpeg Multi-Thread)...");
    
    let ffmpeg_binary = resolve_ffmpeg_binary(app)?;

    let input_frame_pattern = frames_in_dir.join("frame_%08d.png");

    let extract_output = Command::new(&ffmpeg_binary)
        .args(&[
            "-y",
            "-threads", "0",
            "-i", &job.input_path,
            "-q:v", "2",
            "-pix_fmt", "rgb24",
            input_frame_pattern.to_str().unwrap()
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("Failed to run ffmpeg frame extractor: {}", e))?;

    if !extract_output.status.success() {
        let err_log = String::from_utf8_lossy(&extract_output.stderr);
        return Err(format!("ffmpeg failed to extract video frames: {}", err_log.lines().last().unwrap_or("Unknown error")));
    }

    // 4. Count the extracted frames
    let total_frames = fs::read_dir(&frames_in_dir)
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .filter(|entry| entry.path().extension().map_or(false, |ext| ext == "png" || ext == "jpg"))
        .count();

    if total_frames == 0 {
        return Err("No video frames extracted. Check if input file is a valid video.".to_string());
    }

    // 5. Run upscaling on the frames folder using NCNN Vulkan with FP16 (-x) and thread optimization (-j 4:4:4)
    update_progress(app, &job.id, 10.0, &format!("GPU Accelerated Upscaling ({} frames)...", total_frames));

    let sidecar_path = resolve_sidecar_path(app, "realesrgan-ncnn-vulkan")?;
    let models_dir = get_models_dir(app);

    let mut cmd = Command::new(sidecar_path);
    cmd.args(&[
        "-i", frames_in_dir.to_str().unwrap(),
        "-o", frames_out_dir.to_str().unwrap(),
        "-n", &job.model_name,
        "-m", models_dir.to_str().unwrap_or("models"),
        "-g", &job.gpu_id.to_string(),
        "-s", &job.scale.to_string(),
        "-t", &job.tile_size.to_string(),
        "-f", "png",
        "-j", "4:4:4", // Maximize worker thread concurrency (load:proc:save)
        "-x",          // FP16 Precision mode for 2x faster GPU Tensor/Vulkan execution
        "-v"
    ]);

    // Use Stdio::null() to prevent Windows pipe buffer deadlocks when minimized
    cmd.stdout(Stdio::null());
    cmd.stderr(Stdio::null());

    let mut child = cmd.spawn().map_err(|e| format!("Failed to start NCNN upscaler process: {}", e))?;
    crate::sidecar_manager::attach_to_job_object(&child);

    // Spawn a monitor thread to check upscaled files count in the output directory
    let job_id_clone = job.id.clone();
    let app_clone = app.clone();
    let frames_out_clone = frames_out_dir.clone();
    let total_frames_f = total_frames as f64;
    let start_time = std::time::Instant::now();

    let monitor_handle = thread::spawn(move || {
        loop {
            if let Ok(entries) = fs::read_dir(&frames_out_clone) {
                let completed = entries
                    .filter_map(Result::ok)
                    .filter(|entry| entry.path().extension().map_or(false, |ext| ext == "jpg" || ext == "png"))
                    .count();

                let upscale_ratio = completed as f64 / total_frames_f;
                let current_progress = 10.0 + (upscale_ratio * 80.0);

                let elapsed = start_time.elapsed().as_secs_f64();
                let (eta_sec, current_fps) = if completed > 0 && elapsed > 0.5 {
                    let secs_per_frame = elapsed / completed as f64;
                    let remaining_frames = total_frames.saturating_sub(completed);
                    let eta = (remaining_frames as f64 * secs_per_frame) as u64;
                    let fps_val = 1.0 / secs_per_frame;
                    (Some(eta), Some((fps_val * 10.0).round() / 10.0))
                } else {
                    (None, None)
                };

                let _ = app_clone.emit("job-status-changed", JobProgress {
                    job_id: job_id_clone.clone(),
                    percentage: current_progress.min(90.0),
                    status: "processing".to_string(),
                    error: None,
                    phase: Some(format!("Upscaling Video Frames ({} / {})", completed, total_frames)),
                    eta_seconds: eta_sec,
                    fps: current_fps,
                });

                if completed >= total_frames {
                    break;
                }
            }

            thread::sleep(Duration::from_millis(250));
        }
    });

    let status = child.wait().map_err(|e| e.to_string())?;
    
    // Ensure monitor thread completes
    let _ = monitor_handle.join();

    if !status.success() {
        return Err("NCNN upscale engine failed during frame upscaling".to_string());
    }

    // 6. Detect exact output frame extension & pattern in frames_out_dir
    let sample_ext = fs::read_dir(&frames_out_dir)
        .ok()
        .and_then(|mut entries| {
            entries.find_map(|e| {
                if let Ok(entry) = e {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if name.starts_with("frame_") {
                        if name.ends_with(".png") {
                            return Some("png");
                        } else if name.ends_with(".jpg") {
                            return Some("jpg");
                        }
                    }
                }
                None
            })
        })
        .unwrap_or("png");

    let out_frame_pattern = frames_out_dir.join(format!("frame_%08d.{}", sample_ext));

    update_progress(app, &job.id, 92.0, "Reassembling Video & Merging Audio (FFmpeg NVENC/Fast)...");

    // Try hardware-accelerated re-encoding (NVENC or QSV) with CPU fallback
    let hw_result = Command::new(&ffmpeg_binary)
        .args(&[
            "-y",
            "-framerate", &fps_string,
            "-i", out_frame_pattern.to_str().unwrap(),
            "-i", &job.input_path,
            "-c:v", "h264_nvenc",
            "-preset", "p2",
            "-cq", "20",
            "-pix_fmt", "yuv420p",
            "-c:a", "copy",
            "-map", "0:v:0",
            "-map", "1:a:0?",
            &job.output_path
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output();

    let reassemble_success = match hw_result {
        Ok(out) if out.status.success() => true,
        _ => {
            // Fallback to fast CPU x264 re-encoding
            let cpu_out = Command::new(&ffmpeg_binary)
                .args(&[
                    "-y",
                    "-framerate", &fps_string,
                    "-i", out_frame_pattern.to_str().unwrap(),
                    "-i", &job.input_path,
                    "-c:v", "libx264",
                    "-preset", "superfast",
                    "-crf", "18",
                    "-pix_fmt", "yuv420p",
                    "-c:a", "copy",
                    "-map", "0:v:0",
                    "-map", "1:a:0?",
                    &job.output_path
                ])
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .output();

            match cpu_out {
                Ok(out) => out.status.success(),
                Err(_) => false,
            }
        }
    };

    if !reassemble_success {
        return Err("ffmpeg reassemble failed during video output encoding".to_string());
    }

    // 7. Clean up scratch temporary directories
    let _ = fs::remove_dir_all(&job_temp_dir);

    update_progress(app, &job.id, 100.0, "Complete");

    Ok(())
}

/// Helper function to extract framerate fraction string from video using ffprobe with safe fallback.
fn get_video_framerate(app: &AppHandle, video_path: &str) -> String {
    let ffprobe_bin = resolve_sidecar_path(app, "ffprobe")
        .map(|p| p.to_str().unwrap_or("ffprobe").to_string())
        .unwrap_or_else(|_| "ffprobe".to_string());

    if let Ok(output) = Command::new(&ffprobe_bin)
        .args(&[
            "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=r_frame_rate",
            "-of", "default=noprint_wrappers=1:nokey=1",
            video_path
        ])
        .output()
    {
        if output.status.success() {
            let fps_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !fps_str.is_empty() {
                return fps_str;
            }
        }
    }

    "30/1".to_string()
}

/// Helper function to resolve ffmpeg binary (system path or sidecar fallback).
fn resolve_ffmpeg_binary(app: &AppHandle) -> Result<String, String> {
    // 1. Try system PATH
    let system_check = Command::new("ffmpeg")
        .arg("-version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();

    if let Ok(status) = system_check {
        if status.success() {
            return Ok("ffmpeg".to_string());
        }
    }

    // 2. Try sidecar path
    if let Ok(path) = resolve_sidecar_path(app, "ffmpeg") {
        if path.exists() {
            return Ok(path.to_str().unwrap().to_string());
        }
    }

    Err("ffmpeg was not found on system PATH and no sidecar binary is present. Please install FFmpeg on your system to process video files.".to_string())
}

/// Helper function to emit progress updates.
fn update_progress(app: &AppHandle, job_id: &str, percentage: f64, phase_text: &str) {
    let _ = app.emit("job-status-changed", JobProgress {
        job_id: job_id.to_string(),
        percentage,
        status: "processing".to_string(),
        error: None,
        phase: Some(phase_text.to_string()),
        eta_seconds: None,
        fps: None,
    });
}
