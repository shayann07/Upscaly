use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

use crate::job_queue::JobProgress;
use crate::model_manager::get_models_dir;
use crate::process_runner::{ProcessRunner, StdProcessRunner};
use crate::sidecar_manager::resolve_sidecar_path;
use crate::video_pipeline::context::VideoJobContext;
use crate::video_pipeline::encoder::reassemble_with_encoders;

fn lock_handle<'a>(
    ctx: &'a VideoJobContext,
) -> std::sync::MutexGuard<'a, Option<Box<dyn crate::process_runner::ProcessHandle>>> {
    ctx.process_handle
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

pub fn extract_frames(ctx: &VideoJobContext, ffmpeg_binary: &str) -> Result<usize, String> {
    ctx.emit_progress(2.0, "Extracting Video Frames (FFmpeg Multi-Thread)...");

    let input_frame_pattern = ctx.frames_in_dir.join("frame_%08d.png");
    let extract_args = vec![
        "-y".to_string(),
        "-threads".to_string(),
        "0".to_string(),
        "-i".to_string(),
        ctx.job.input_path.clone(),
        "-q:v".to_string(),
        "2".to_string(),
        "-pix_fmt".to_string(),
        "rgb24".to_string(),
        input_frame_pattern.to_string_lossy().to_string(),
    ];

    let runner = StdProcessRunner::new();
    let extract_handle = runner
        .spawn(&PathBuf::from(ffmpeg_binary), &extract_args)
        .map_err(|e| e.to_string())?;

    {
        let mut handle_guard = lock_handle(ctx);
        *handle_guard = Some(extract_handle);
    }

    loop {
        if ctx.is_cancelled() {
            let mut handle_guard = lock_handle(ctx);
            if let Some(ref mut h) = *handle_guard {
                let _ = h.kill();
            }
            return Err("cancelled".to_string());
        }

        let mut handle_guard = lock_handle(ctx);
        if let Some(ref mut h) = *handle_guard {
            match h.try_wait() {
                Ok(Some(0)) => break,
                Ok(Some(code)) => {
                    return Err(format!(
                        "FFmpeg frame extractor failed with exit code: {code}"
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

    if ctx.is_cancelled() {
        return Err("cancelled".to_string());
    }

    let total_frames = fs::read_dir(&ctx.frames_in_dir)
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .filter(|entry| {
            entry.path().extension().is_some_and(|ext| {
                ext.eq_ignore_ascii_case("png") || ext.eq_ignore_ascii_case("jpg")
            })
        })
        .count();

    if total_frames == 0 {
        return Err("No video frames extracted. Check if input file is a valid video.".to_string());
    }

    Ok(total_frames)
}

pub fn upscale_frames(ctx: &VideoJobContext, total_frames: usize) -> Result<(), String> {
    ctx.emit_progress(
        10.0,
        &format!("GPU Accelerated Upscaling ({total_frames} frames)..."),
    );

    spawn_upscale_engine(ctx)?;
    poll_upscale_progress(ctx, total_frames)
}

fn spawn_upscale_engine(ctx: &VideoJobContext) -> Result<(), String> {
    let sidecar_path = resolve_sidecar_path(ctx.app, "realesrgan-ncnn-vulkan")?;
    let models_dir = get_models_dir(ctx.app);
    let effective_scale = crate::job_queue::resolve_effective_scale(
        &ctx.job.model_name,
        ctx.job.scale,
        Some(&models_dir),
    );
    let tile_size = crate::job_queue::normalize_tile_size(ctx.job.tile_size);

    let upscale_args = vec![
        "-i".to_string(),
        ctx.frames_in_dir.to_string_lossy().to_string(),
        "-o".to_string(),
        ctx.frames_out_dir.to_string_lossy().to_string(),
        "-n".to_string(),
        ctx.job.model_name.clone(),
        "-m".to_string(),
        models_dir.to_str().unwrap_or("models").to_string(),
        "-g".to_string(),
        ctx.job.gpu_id.to_string(),
        "-s".to_string(),
        effective_scale.to_string(),
        "-t".to_string(),
        tile_size.to_string(),
        "-f".to_string(),
        "png".to_string(),
        "-j".to_string(),
        "1:2:2".to_string(),
        "-v".to_string(),
    ];

    let runner = StdProcessRunner::new();
    let upscale_handle = runner
        .spawn(&sidecar_path, &upscale_args)
        .map_err(|e| e.to_string())?;

    let mut handle_guard = lock_handle(ctx);
    *handle_guard = Some(upscale_handle);
    Ok(())
}

#[allow(
    clippy::cast_precision_loss,
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss
)]
fn poll_upscale_progress(ctx: &VideoJobContext, total_frames: usize) -> Result<(), String> {
    let total_frames_f = total_frames as f64;
    let start_time = std::time::Instant::now();

    loop {
        if ctx.is_cancelled() {
            let mut handle_guard = lock_handle(ctx);
            if let Some(ref mut h) = *handle_guard {
                let _ = h.kill();
            }
            return Err("cancelled".to_string());
        }

        let is_done = {
            let mut handle_guard = lock_handle(ctx);
            if let Some(ref mut h) = *handle_guard {
                match h.try_wait() {
                    Ok(Some(0)) => {
                        let stderr_log = h.get_stderr_log();
                        if stderr_log.contains("vkAllocateMemory failed")
                            || stderr_log.contains("vkQueueSubmit failed")
                        {
                            return Err("GPU VRAM allocation failed (Vulkan memory overflow). Try selecting a smaller tile size (e.g. 256px or 128px).".to_string());
                        }
                        true
                    }
                    Ok(Some(code)) => {
                        let stderr_log = h.get_stderr_log();
                        if stderr_log.trim().is_empty() {
                            return Err(format!("NCNN upscale engine failed with exit code: {code}"));
                        }
                        return Err(format!(
                            "NCNN upscale engine failed with exit code {code}: {stderr_log}"
                        ));
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

        if let Ok(entries) = fs::read_dir(&ctx.frames_out_dir) {
            let completed = entries
                .filter_map(Result::ok)
                .filter(|entry| {
                    entry.path().extension().is_some_and(|ext| {
                        ext.eq_ignore_ascii_case("jpg") || ext.eq_ignore_ascii_case("png")
                    })
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

            let _ = ctx.app.emit(
                "job-status-changed",
                JobProgress {
                    job_id: ctx.job.id.clone(),
                    percentage: current_progress.min(90.0),
                    status: "running".to_string(),
                    error: None,
                    phase: Some(format!(
                        "Upscaling Video Frames ({completed} / {total_frames})"
                    )),
                    eta_seconds: eta_sec,
                    fps: current_fps,
                    output_path: None,
                },
            );
        }

        thread::sleep(Duration::from_millis(200));
    }

    if ctx.is_cancelled() {
        return Err("cancelled".to_string());
    }

    Ok(())
}

pub fn reassemble_video(
    ctx: &VideoJobContext,
    ffmpeg_binary: &str,
    fps_string: &str,
) -> Result<(), String> {
    let sample_ext = fs::read_dir(&ctx.frames_out_dir)
        .ok()
        .and_then(|mut entries| {
            entries.find_map(|e| {
                if let Ok(entry) = e {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if name.starts_with("frame_") {
                        if Path::new(&name)
                            .extension()
                            .is_some_and(|ext| ext.eq_ignore_ascii_case("png"))
                        {
                            return Some("png");
                        } else if Path::new(&name)
                            .extension()
                            .is_some_and(|ext| ext.eq_ignore_ascii_case("jpg"))
                        {
                            return Some("jpg");
                        }
                    }
                }
                None
            })
        })
        .unwrap_or("png");

    let out_frame_pattern = ctx.frames_out_dir.join(format!("frame_%08d.{sample_ext}"));
    let normalized_pattern = out_frame_pattern.to_string_lossy().replace('\\', "/");

    ctx.emit_progress(92.0, "Reassembling Video & Merging Audio...");
    reassemble_with_encoders(ctx, ffmpeg_binary, fps_string, &normalized_pattern)
}

pub fn check_and_get_framerate(app: &AppHandle, video_path: &str) -> Result<String, String> {
    let ffprobe_bin = resolve_ffprobe_binary(app)?;

    let output = Command::new(&ffprobe_bin)
        .args([
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
        .map_err(|e| format!("Failed to run ffprobe: {e}"))?;

    if !output.status.success() {
        return Ok("30/1".to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let lines: Vec<&str> = stdout
        .lines()
        .map(str::trim)
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

pub fn resolve_ffmpeg_binary(app: &AppHandle) -> Result<String, String> {
    if let Ok(path) = resolve_sidecar_path(app, "ffmpeg") {
        if path.exists() {
            return Ok(path.to_string_lossy().to_string());
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

pub fn resolve_ffprobe_binary(app: &AppHandle) -> Result<String, String> {
    if let Ok(path) = resolve_sidecar_path(app, "ffprobe") {
        if path.exists() {
            return Ok(path.to_string_lossy().to_string());
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
