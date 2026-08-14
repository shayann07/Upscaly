pub mod context;
pub mod encoder;
pub mod phases;

use crate::job_queue::Job;
use crate::process_runner::ProcessHandle;
use context::VideoJobContext;
use phases::{probe_video_metadata, reassemble_video, run_overlapping_upscale_pipeline};
pub use phases::{resolve_ffmpeg_binary, resolve_ffprobe_binary};

use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use std::sync::Mutex;
use tauri::AppHandle;

/// Orchestrates the entire concurrent, overlapping video upscaling pipeline with full cancellation support.
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

    let meta = probe_video_metadata(app, &job.input_path)?;

    if ctx.is_cancelled() {
        return Err("cancelled".to_string());
    }

    let ffmpeg_binary = resolve_ffmpeg_binary(app)?;

    // Run overlapping concurrent frame extraction + batch upscaling
    run_overlapping_upscale_pipeline(&ctx, &ffmpeg_binary, &meta)?;

    if ctx.is_cancelled() {
        return Err("cancelled".to_string());
    }

    // Reassemble upscaled frames and merge audio stream
    reassemble_video(&ctx, &ffmpeg_binary, &meta.fps_string)?;

    ctx.emit_progress(100.0, "Complete");
    Ok(())
}
