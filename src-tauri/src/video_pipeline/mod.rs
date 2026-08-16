pub mod context;
pub mod encoder;
pub mod phases;

use crate::error::AppError;
use crate::job_queue::Job;
use crate::process_runner::ProcessHandle;
use context::VideoJobContext;
use phases::{probe_video_metadata, reassemble_video, run_overlapping_upscale_pipeline};
pub mod resume;

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
) -> Result<(), AppError> {
    let (ctx, guard) = VideoJobContext::new(app, job, cancel_requested, process_handle)?;

    let result = run_video_job_inner(&ctx, app, job);

    if result.is_err() {
        // If the pipeline aborts partway through (NCNN failure, reassembly
        // failure, cancellation, etc.) make sure no child process is left
        // running. Without this, an error return here left the background
        // ffmpeg frame extractor decoding the rest of the video into the
        // temp dir -- which the TempFolderGuard then couldn't even fully
        // delete on Windows while ffmpeg still had files open inside it.
        if let Ok(mut handle_guard) = ctx.process_handle.lock() {
            if let Some(ref mut handle) = *handle_guard {
                let _ = handle.kill();
            }
        }
    }

    // A failed run's completed frames are hours of GPU work; deleting them
    // makes the failure cost the entire job. Keep the folder when there is
    // anything worth resuming and the failure was not the user's own
    // cancellation -- a cancel is an explicit "discard this". The guard's
    // Drop is what deletes, so keeping means forgetting it.
    match &result {
        Err(err) if !err.is_cancellation() => {
            let frames_dir = ctx.frames_out_dir.clone();
            drop(ctx);
            if resume::verified_frame_count(&frames_dir) > 0 {
                std::mem::forget(guard);
            }
        }
        _ => {}
    }

    result
}

fn run_video_job_inner(ctx: &VideoJobContext, app: &AppHandle, job: &Job) -> Result<(), AppError> {
    if ctx.is_cancelled() {
        return Err(AppError::Cancelled);
    }

    let meta = probe_video_metadata(app, &job.input_path)?;

    if ctx.is_cancelled() {
        return Err(AppError::Cancelled);
    }

    let ffmpeg_binary = resolve_ffmpeg_binary(app)?;

    // Run overlapping concurrent frame extraction + batch upscaling
    run_overlapping_upscale_pipeline(ctx, &ffmpeg_binary, &meta)?;

    if ctx.is_cancelled() {
        return Err(AppError::Cancelled);
    }

    // Reassemble upscaled frames and merge audio stream
    reassemble_video(ctx, &ffmpeg_binary, &meta.fps_string)?;

    ctx.emit_progress(100.0, "Complete");
    Ok(())
}
