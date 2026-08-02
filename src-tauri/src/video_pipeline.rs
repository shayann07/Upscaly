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

    // 2. Query original video framerate via ffprobe
    let fps_string = get_video_framerate(&job.input_path)?;

    // 3. Extract video frames using ffmpeg
    update_progress(app, &job.id, 5.0, "Extracting video frames...");
    
    let ffmpeg_binary = resolve_ffmpeg_binary(app)?;
    let extract_status = Command::new(&ffmpeg_binary)
        .args(&[
            "-y",
            "-i", &job.input_path,
            "-q:v", "2", // High quality JPEG
            "-pix_fmt", "yuvj420p",
            frames_in_dir.join("frame_%08d.jpg").to_str().unwrap()
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map_err(|e| format!("Failed to run ffmpeg frame extractor: {}", e))?;

    if !extract_status.success() {
        return Err("ffmpeg failed to extract video frames".to_string());
    }

    // 4. Count the extracted frames
    let total_frames = fs::read_dir(&frames_in_dir)
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .filter(|entry| entry.path().extension().map_or(false, |ext| ext == "jpg"))
        .count();

    if total_frames == 0 {
        return Err("No video frames extracted. Check if video has valid streams.".to_string());
    }

    // 5. Run upscaling on the frames folder using NCNN Vulkan
    update_progress(app, &job.id, 10.0, "Upscaling video frames...");

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
        "-v"
    ]);

    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| format!("Failed to start NCNN upscaler process: {}", e))?;

    // Spawn a monitor thread to check upscaled files count in the output directory
    let job_id_clone = job.id.clone();
    let app_clone = app.clone();
    let frames_out_clone = frames_out_dir.clone();
    let total_frames_f = total_frames as f64;

    let monitor_handle = thread::spawn(move || {
        loop {
            // Count completed files in frames_out_dir
            if let Ok(entries) = fs::read_dir(&frames_out_clone) {
                let completed = entries
                    .filter_map(Result::ok)
                    .filter(|entry| entry.path().extension().map_or(false, |ext| ext == "jpg" || ext == "png"))
                    .count();

                // Upscaling takes 10% to 90% of total progress
                let upscale_ratio = completed as f64 / total_frames_f;
                let current_progress = 10.0 + (upscale_ratio * 80.0);

                let _status_msg = format!("Upscaling frames ({} / {})...", completed, total_frames);
                let _ = app_clone.emit("job-status-changed", JobProgress {
                    job_id: job_id_clone.clone(),
                    percentage: current_progress.min(90.0),
                    status: "processing".to_string(),
                    error: None,
                });

                if completed >= total_frames {
                    break;
                }
            }

            thread::sleep(Duration::from_millis(500));
        }
    });

    let status = child.wait().map_err(|e| e.to_string())?;
    
    // Ensure monitor thread completes
    let _ = monitor_handle.join();

    if !status.success() {
        return Err("NCNN upscale engine failed during frame upscaling".to_string());
    }

    // 6. Reassemble frames into output video using ffmpeg
    update_progress(app, &job.id, 90.0, "Reassembling video and merging audio...");

    let reassemble_status = Command::new(&ffmpeg_binary)
        .args(&[
            "-y",
            "-framerate", &fps_string,
            "-i", frames_out_dir.join("frame_%08d.jpg").to_str().unwrap(),
            "-i", &job.input_path,
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-c:a", "copy",
            "-map", "0:v:0",
            "-map", "1:a:0?", // optional audio map
            &job.output_path
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map_err(|e| format!("Failed to run ffmpeg frame reassembler: {}", e))?;

    if !reassemble_status.success() {
        return Err("ffmpeg failed to reassemble output video".to_string());
    }

    // 7. Clean up scratch temporary directories
    let _ = fs::remove_dir_all(&job_temp_dir);

    update_progress(app, &job.id, 100.0, "Done");

    Ok(())
}

/// Helper function to extract framerate fraction string from video using ffprobe.
fn get_video_framerate(video_path: &str) -> Result<String, String> {
    let output = Command::new("ffprobe")
        .args(&[
            "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=r_frame_rate",
            "-of", "default=noprint_wrappers=1:nokey=1",
            video_path
        ])
        .output()
        .map_err(|e| format!("Failed to execute ffprobe: {}", e))?;

    if !output.status.success() {
        return Err("ffprobe failed to extract video metadata".to_string());
    }

    let mut fps_str = String::from_utf8_lossy(&output.stdout).to_string();
    fps_str = fps_str.trim().to_string();
    
    if fps_str.is_empty() {
        // Fallback to standard 30fps if empty
        Ok("30/1".to_string())
    } else {
        Ok(fps_str)
    }
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

    Err("ffmpeg was not found on system PATH and no sidecar binary is present".to_string())
}

/// Helper function to emit progress updates.
fn update_progress(app: &AppHandle, job_id: &str, percentage: f64, status: &str) {
    let _ = app.emit("job-status-changed", JobProgress {
        job_id: job_id.to_string(),
        percentage,
        status: status.to_string(),
        error: None,
    });
}
