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

    // 2. Query original video framerate and check for VFR rejection
    let fps_string = check_and_get_framerate(app, &job.input_path)?;

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
    let stop_monitor = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    let stop_monitor_clone = std::sync::Arc::clone(&stop_monitor);

    let monitor_handle = thread::spawn(move || {
        loop {
            if stop_monitor_clone.load(std::sync::atomic::Ordering::SeqCst) {
                break;
            }

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
                    status: "running".to_string(),
                    error: None,
                    phase: Some(format!("Upscaling Video Frames ({} / {})", completed, total_frames)),
                    eta_seconds: eta_sec,
                    fps: current_fps,
                    output_path: None,
                });

                if completed >= total_frames {
                    break;
                }
            }

            thread::sleep(Duration::from_millis(250));
        }
    });

    let status = child.wait().map_err(|e| e.to_string())?;
    
    // Stop and join monitor thread cleanly
    stop_monitor.store(true, std::sync::atomic::Ordering::SeqCst);
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

    update_progress(app, &job.id, 92.0, "Reassembling Video & Merging Audio...");

    // LGPL Vendor H.264 Encoder Fallback Chain: NVENC -> QSV -> AMF -> MF
    const H264_ENCODERS: &[&str] = &["h264_nvenc", "h264_qsv", "h264_amf", "h264_mf"];
    let mut reassemble_success = false;

    for &encoder in H264_ENCODERS {
        // 1. Try audio pass-through (-c:a copy)
        let copy_res = Command::new(&ffmpeg_binary)
            .args(&[
                "-y",
                "-framerate", &fps_string,
                "-i", out_frame_pattern.to_str().unwrap(),
                "-i", &job.input_path,
                "-c:v", encoder,
                "-pix_fmt", "yuv420p",
                "-c:a", "copy",
                "-map", "0:v:0",
                "-map", "1:a:0?",
                &job.output_path
            ])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output();

        if let Ok(out) = copy_res {
            if out.status.success() {
                reassemble_success = true;
                break;
            }
        }

        // 2. Audio copy failed (e.g. incompatible stream for MP4 container); fallback to AAC 192k stereo
        let aac_res = Command::new(&ffmpeg_binary)
            .args(&[
                "-y",
                "-framerate", &fps_string,
                "-i", out_frame_pattern.to_str().unwrap(),
                "-i", &job.input_path,
                "-c:v", encoder,
                "-pix_fmt", "yuv420p",
                "-c:a", "aac",
                "-b:a", "192k",
                "-ac", "2",
                "-map", "0:v:0",
                "-map", "1:a:0?",
                &job.output_path
            ])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output();

        if let Ok(out) = aac_res {
            if out.status.success() {
                reassemble_success = true;
                break;
            }
        }
    }

    if !reassemble_success {
        return Err("No supported LGPL hardware H.264 encoder available (tried h264_nvenc, h264_qsv, h264_amf, h264_mf). Please update GPU drivers or install Media Foundation.".to_string());
    }

    // 7. Clean up scratch temporary directories
    let _ = fs::remove_dir_all(&job_temp_dir);

    update_progress(app, &job.id, 100.0, "Complete");

    Ok(())
}

/// Helper function to check for VFR rejection and return valid CFR framerate fraction string.
fn check_and_get_framerate(app: &AppHandle, video_path: &str) -> Result<String, String> {
    let ffprobe_bin = resolve_ffprobe_binary(app)?;

    let output = Command::new(&ffprobe_bin)
        .args(&[
            "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=r_frame_rate,avg_frame_rate",
            "-of", "default=noprint_wrappers=1:nokey=1",
            video_path
        ])
        .output()
        .map_err(|e| format!("Failed to run ffprobe: {}", e))?;

    if !output.status.success() {
        return Ok("30/1".to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let lines: Vec<&str> = stdout.lines().map(|s| s.trim()).filter(|s| !s.is_empty()).collect();

    if lines.len() >= 2 {
        let r_fps = lines[0];
        let avg_fps = lines[1];

        if r_fps != avg_fps && r_fps != "0/0" && avg_fps != "0/0" {
            if let (Some(r_val), Some(avg_val)) = (parse_fps_fraction(r_fps), parse_fps_fraction(avg_fps)) {
                if (r_val - avg_val).abs() > 0.5 {
                    return Err("Variable frame rate (VFR) videos are not supported in this release. Please convert to constant frame rate (CFR) before upscaling.".to_string());
                }
            }
        }
        return Ok(r_fps.to_string());
    } else if lines.len() == 1 {
        return Ok(lines[0].to_string());
    }

    Ok("30/1".to_string())
}

fn parse_fps_fraction(s: &str) -> Option<f64> {
    let parts: Vec<&str> = s.split('/').collect();
    if parts.len() == 2 {
        let num: f64 = parts[0].parse().ok()?;
        let den: f64 = parts[1].parse().ok()?;
        if den > 0.0 {
            return Some(num / den);
        }
    } else if parts.len() == 1 {
        return s.parse().ok();
    }
    None
}

/// Helper function to resolve ffmpeg binary (sidecar preferred in production, system PATH fallback).
pub fn resolve_ffmpeg_binary(app: &AppHandle) -> Result<String, String> {
    if let Ok(path) = resolve_sidecar_path(app, "ffmpeg") {
        if path.exists() {
            return Ok(path.to_str().unwrap().to_string());
        }
    }

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

    Err("FFmpeg binary was not found. Bundled sidecar missing and no system PATH installation present.".to_string())
}

/// Helper function to resolve ffprobe binary (sidecar preferred in production, system PATH fallback).
pub fn resolve_ffprobe_binary(app: &AppHandle) -> Result<String, String> {
    if let Ok(path) = resolve_sidecar_path(app, "ffprobe") {
        if path.exists() {
            return Ok(path.to_str().unwrap().to_string());
        }
    }

    let system_check = Command::new("ffprobe")
        .arg("-version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();

    if let Ok(status) = system_check {
        if status.success() {
            return Ok("ffprobe".to_string());
        }
    }

    Err("FFprobe binary was not found. Bundled sidecar missing and no system PATH installation present.".to_string())
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
        output_path: None,
    });
}
