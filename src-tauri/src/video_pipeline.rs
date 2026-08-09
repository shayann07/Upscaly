use crate::job_queue::{Job, JobProgress};
use crate::model_manager::get_models_dir;
use crate::sidecar_manager::resolve_sidecar_path;
use std::fs;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

use crate::process_runner::{ProcessHandle, ProcessRunner, StdProcessRunner};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::sync::Mutex;

/// RAII Guard for temporary job directories to guarantee cleanup on success, failure, or cancellation.
pub struct TempFolderGuard(pub PathBuf);

impl Drop for TempFolderGuard {
    fn drop(&mut self) {
        if self.0.exists() {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
}

/// Orchestrates the entire video upscaling pipeline with full cancellation support and process handles.
pub fn run_video_job(
    app: &AppHandle,
    job: &Job,
    cancel_requested: Arc<AtomicBool>,
    process_handle: Arc<Mutex<Option<Box<dyn ProcessHandle>>>>,
) -> Result<(), String> {
    // 1. Create temporary directories
    let cache_dir = app
        .path()
        .app_cache_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    let job_temp_dir = cache_dir.join(format!("upscaler_job_{}", job.id));
    let _guard = TempFolderGuard(job_temp_dir.clone());

    let frames_in_dir = job_temp_dir.join("frames_in");
    let frames_out_dir = job_temp_dir.join("frames_out");

    // Clean up any stale directory from previous attempts
    let _ = fs::remove_dir_all(&job_temp_dir);
    fs::create_dir_all(&frames_in_dir)
        .map_err(|e| format!("Failed to create input frames folder: {}", e))?;
    fs::create_dir_all(&frames_out_dir)
        .map_err(|e| format!("Failed to create output frames folder: {}", e))?;

    if cancel_requested.load(Ordering::SeqCst) {
        return Err("cancelled".to_string());
    }

    // 2. Query original video framerate and check for VFR rejection
    let fps_string = check_and_get_framerate(app, &job.input_path)?;

    if cancel_requested.load(Ordering::SeqCst) {
        return Err("cancelled".to_string());
    }

    // 3. Extract video frames using multi-threaded FFmpeg
    update_progress(
        app,
        &job.id,
        2.0,
        "Extracting Video Frames (FFmpeg Multi-Thread)...",
    );

    let ffmpeg_binary = resolve_ffmpeg_binary(app)?;
    let input_frame_pattern = frames_in_dir.join("frame_%08d.png");

    let extract_args = vec![
        "-y".to_string(),
        "-threads".to_string(),
        "0".to_string(),
        "-i".to_string(),
        job.input_path.clone(),
        "-q:v".to_string(),
        "2".to_string(),
        "-pix_fmt".to_string(),
        "rgb24".to_string(),
        input_frame_pattern.to_str().unwrap().to_string(),
    ];

    let runner = StdProcessRunner::new();
    let extract_handle = runner
        .spawn(&PathBuf::from(&ffmpeg_binary), &extract_args)
        .map_err(|e| e.to_string())?;

    {
        let mut handle_guard = process_handle.lock().unwrap();
        *handle_guard = Some(extract_handle);
    }

    // Poll frame extraction until complete or cancelled
    loop {
        if cancel_requested.load(Ordering::SeqCst) {
            let mut handle_guard = process_handle.lock().unwrap();
            if let Some(ref mut h) = *handle_guard {
                let _ = h.kill();
            }
            return Err("cancelled".to_string());
        }

        let mut handle_guard = process_handle.lock().unwrap();
        if let Some(ref mut h) = *handle_guard {
            match h.try_wait() {
                Ok(Some(0)) => break,
                Ok(Some(code)) => {
                    return Err(format!(
                        "FFmpeg frame extractor failed with exit code: {}",
                        code
                    ))
                }
                Ok(None) => {}
                Err(e) => return Err(e.to_string()),
            }
        } else {
            break;
        }
        drop(handle_guard);
        thread::sleep(Duration::from_millis(100));
    }

    if cancel_requested.load(Ordering::SeqCst) {
        return Err("cancelled".to_string());
    }

    // 4. Count the extracted frames
    let total_frames = fs::read_dir(&frames_in_dir)
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .filter(|entry| {
            entry
                .path()
                .extension()
                .map_or(false, |ext| ext == "png" || ext == "jpg")
        })
        .count();

    if total_frames == 0 {
        return Err("No video frames extracted. Check if input file is a valid video.".to_string());
    }

    // 5. Run upscaling on the frames folder using NCNN Vulkan
    update_progress(
        app,
        &job.id,
        10.0,
        &format!("GPU Accelerated Upscaling ({} frames)...", total_frames),
    );

    let sidecar_path = resolve_sidecar_path(app, "realesrgan-ncnn-vulkan")?;
    let models_dir = get_models_dir(app);

    let upscale_args = vec![
        "-i".to_string(),
        frames_in_dir.to_str().unwrap().to_string(),
        "-o".to_string(),
        frames_out_dir.to_str().unwrap().to_string(),
        "-n".to_string(),
        job.model_name.clone(),
        "-m".to_string(),
        models_dir.to_str().unwrap_or("models").to_string(),
        "-g".to_string(),
        job.gpu_id.to_string(),
        "-s".to_string(),
        job.scale.to_string(),
        "-t".to_string(),
        job.tile_size.to_string(),
        "-f".to_string(),
        "png".to_string(),
        "-j".to_string(),
        "1:2:2".to_string(),
        "-v".to_string(),
    ];

    let upscale_handle = runner
        .spawn(&sidecar_path, &upscale_args)
        .map_err(|e| e.to_string())?;

    {
        let mut handle_guard = process_handle.lock().unwrap();
        *handle_guard = Some(upscale_handle);
    }

    let total_frames_f = total_frames as f64;
    let start_time = std::time::Instant::now();

    // Poll upscaler process until complete or cancelled
    loop {
        if cancel_requested.load(Ordering::SeqCst) {
            let mut handle_guard = process_handle.lock().unwrap();
            if let Some(ref mut h) = *handle_guard {
                let _ = h.kill();
            }
            return Err("cancelled".to_string());
        }

        let is_done = {
            let mut handle_guard = process_handle.lock().unwrap();
            if let Some(ref mut h) = *handle_guard {
                match h.try_wait() {
                    Ok(Some(0)) => true,
                    Ok(Some(code)) => {
                        return Err(format!(
                            "NCNN upscale engine failed with exit code: {}",
                            code
                        ))
                    }
                    Ok(None) => false,
                    Err(e) => return Err(e.to_string()),
                }
            } else {
                true
            }
        };

        if is_done {
            break;
        }

        if let Ok(entries) = fs::read_dir(&frames_out_dir) {
            let completed = entries
                .filter_map(Result::ok)
                .filter(|entry| {
                    entry
                        .path()
                        .extension()
                        .map_or(false, |ext| ext == "jpg" || ext == "png")
                })
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

            let _ = app.emit(
                "job-status-changed",
                JobProgress {
                    job_id: job.id.clone(),
                    percentage: current_progress.min(90.0),
                    status: "running".to_string(),
                    error: None,
                    phase: Some(format!(
                        "Upscaling Video Frames ({} / {})",
                        completed, total_frames
                    )),
                    eta_seconds: eta_sec,
                    fps: current_fps,
                    output_path: None,
                },
            );
        }

        thread::sleep(Duration::from_millis(200));
    }

    if cancel_requested.load(Ordering::SeqCst) {
        return Err("cancelled".to_string());
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
    let normalized_pattern = out_frame_pattern.to_str().unwrap().replace('\\', "/");

    update_progress(app, &job.id, 92.0, "Reassembling Video & Merging Audio...");

    // Encoder Fallback Chain: NVENC -> QSV -> AMF -> MF -> libx264 -> mpeg4
    const H264_ENCODERS: &[&str] = &[
        "h264_nvenc",
        "h264_qsv",
        "h264_amf",
        "h264_mf",
        "libx264",
        "mpeg4",
    ];
    let mut reassemble_success = false;
    let mut last_error_log = String::new();

    for &encoder in H264_ENCODERS {
        if cancel_requested.load(Ordering::SeqCst) {
            return Err("cancelled".to_string());
        }

        // 1. Try audio pass-through (-c:a copy)
        let copy_args = vec![
            "-y".to_string(),
            "-framerate".to_string(),
            fps_string.clone(),
            "-start_number".to_string(),
            "1".to_string(),
            "-i".to_string(),
            normalized_pattern.clone(),
            "-i".to_string(),
            job.input_path.clone(),
            "-c:v".to_string(),
            encoder.to_string(),
            "-pix_fmt".to_string(),
            "yuv420p".to_string(),
            "-c:a".to_string(),
            "copy".to_string(),
            "-map".to_string(),
            "0:v:0".to_string(),
            "-map".to_string(),
            "1:a:0?".to_string(),
            job.output_path.clone(),
        ];

        let handle = runner
            .spawn(&PathBuf::from(&ffmpeg_binary), &copy_args)
            .ok();
        if let Some(mut h) = handle {
            let mut success = false;
            loop {
                if cancel_requested.load(Ordering::SeqCst) {
                    let _ = h.kill();
                    return Err("cancelled".to_string());
                }
                match h.try_wait() {
                    Ok(Some(0)) => {
                        success = true;
                        break;
                    }
                    Ok(Some(_)) => {
                        let err = h.get_stderr_log();
                        if !err.is_empty() {
                            last_error_log = err;
                        }
                        break;
                    }
                    Ok(None) => thread::sleep(Duration::from_millis(50)),
                    Err(_) => break,
                }
            }
            if success {
                reassemble_success = true;
                break;
            }
        }

        // 2. Audio copy failed (e.g. incompatible stream); fallback to AAC 192k stereo
        let aac_args = vec![
            "-y".to_string(),
            "-framerate".to_string(),
            fps_string.clone(),
            "-start_number".to_string(),
            "1".to_string(),
            "-i".to_string(),
            normalized_pattern.clone(),
            "-i".to_string(),
            job.input_path.clone(),
            "-c:v".to_string(),
            encoder.to_string(),
            "-pix_fmt".to_string(),
            "yuv420p".to_string(),
            "-c:a".to_string(),
            "aac".to_string(),
            "-b:a".to_string(),
            "192k".to_string(),
            "-ac".to_string(),
            "2".to_string(),
            "-map".to_string(),
            "0:v:0".to_string(),
            "-map".to_string(),
            "1:a:0?".to_string(),
            job.output_path.clone(),
        ];

        let handle_aac = runner.spawn(&PathBuf::from(&ffmpeg_binary), &aac_args).ok();
        if let Some(mut h) = handle_aac {
            let mut success = false;
            loop {
                if cancel_requested.load(Ordering::SeqCst) {
                    let _ = h.kill();
                    return Err("cancelled".to_string());
                }
                match h.try_wait() {
                    Ok(Some(0)) => {
                        success = true;
                        break;
                    }
                    Ok(Some(_)) => {
                        let err = h.get_stderr_log();
                        if !err.is_empty() {
                            last_error_log = err;
                        }
                        break;
                    }
                    Ok(None) => thread::sleep(Duration::from_millis(50)),
                    Err(_) => break,
                }
            }
            if success {
                reassemble_success = true;
                break;
            }
        }

        // 3. Fallback to video-only reassembly if audio mapping fails
        let video_only_args = vec![
            "-y".to_string(),
            "-framerate".to_string(),
            fps_string.clone(),
            "-start_number".to_string(),
            "1".to_string(),
            "-i".to_string(),
            normalized_pattern.clone(),
            "-c:v".to_string(),
            encoder.to_string(),
            "-pix_fmt".to_string(),
            "yuv420p".to_string(),
            job.output_path.clone(),
        ];

        let handle_video_only = runner
            .spawn(&PathBuf::from(&ffmpeg_binary), &video_only_args)
            .ok();
        if let Some(mut h) = handle_video_only {
            let mut success = false;
            loop {
                if cancel_requested.load(Ordering::SeqCst) {
                    let _ = h.kill();
                    return Err("cancelled".to_string());
                }
                match h.try_wait() {
                    Ok(Some(0)) => {
                        success = true;
                        break;
                    }
                    Ok(Some(_)) => {
                        let err = h.get_stderr_log();
                        if !err.is_empty() {
                            last_error_log = err;
                        }
                        break;
                    }
                    Ok(None) => thread::sleep(Duration::from_millis(50)),
                    Err(_) => break,
                }
            }
            if success {
                reassemble_success = true;
                break;
            }
        }
    }

    if !reassemble_success {
        let msg = if !last_error_log.is_empty() {
            format!(
                "No supported H.264 video encoder available. FFmpeg error output: {}",
                last_error_log
            )
        } else {
            "No supported H.264 video encoder available (tried h264_nvenc, h264_qsv, h264_amf, h264_mf, libx264, mpeg4).".to_string()
        };
        return Err(msg);
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
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=r_frame_rate,avg_frame_rate",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            video_path,
        ])
        .output()
        .map_err(|e| format!("Failed to run ffprobe: {}", e))?;

    if !output.status.success() {
        return Ok("30/1".to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let lines: Vec<&str> = stdout
        .lines()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .collect();

    if lines.len() >= 2 {
        let r_fps = lines[0];
        let avg_fps = lines[1];

        if r_fps != avg_fps && r_fps != "0/0" && avg_fps != "0/0" {
            if let (Some(r_val), Some(avg_val)) =
                (parse_fps_fraction(r_fps), parse_fps_fraction(avg_fps))
            {
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
    let _ = app.emit(
        "job-status-changed",
        JobProgress {
            job_id: job_id.to_string(),
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
