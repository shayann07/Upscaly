pub mod context;
pub mod encoder;
pub mod phases;

use crate::job_queue::Job;
use crate::process_runner::ProcessHandle;
use context::VideoJobContext;
use phases::{check_and_get_framerate, extract_frames, reassemble_video, upscale_frames};
pub use phases::{resolve_ffmpeg_binary, resolve_ffprobe_binary};

use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use std::sync::Mutex;
use tauri::AppHandle;

/// Orchestrates the entire video upscaling pipeline with full cancellation support and process handles.
pub fn run_video_job(
    app: &AppHandle,
    job: &Job,
    cancel_requested: Arc<AtomicBool>,
    process_handle: Arc<Mutex<Option<Box<dyn ProcessHandle>>>>,
) -> Result<(), String> {
    let (ctx, _guard) = VideoJobContext::new(app, job, cancel_requested, process_handle)?;

    if ctx.is_cancelled() {
        return Err("cancelled".to_string());
    }

    let fps_string = check_and_get_framerate(app, &job.input_path)?;

    if ctx.is_cancelled() {
        return Err("cancelled".to_string());
    }

    let ffmpeg_binary = resolve_ffmpeg_binary(app)?;
    let total_frames = extract_frames(&ctx, &ffmpeg_binary)?;

    upscale_frames(&ctx, total_frames)?;
    reassemble_video(&ctx, &ffmpeg_binary, &fps_string)?;

    ctx.emit_progress(100.0, "Complete");
    Ok(())
}
