use std::path::PathBuf;
use std::thread;
use std::time::Duration;

use crate::process_runner::{ProcessRunner, StdProcessRunner};
use crate::video_pipeline::context::VideoJobContext;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EncoderStrategy {
    Nvenc,
    Qsv,
    Amf,
    Mf,
    Libx264,
    Mpeg4,
}

impl EncoderStrategy {
    pub fn all() -> &'static [EncoderStrategy] {
        &[
            EncoderStrategy::Nvenc,
            EncoderStrategy::Qsv,
            EncoderStrategy::Amf,
            EncoderStrategy::Mf,
            EncoderStrategy::Libx264,
            EncoderStrategy::Mpeg4,
        ]
    }

    #[allow(clippy::too_many_lines)]
    pub fn to_args(
        self,
        fps_string: &str,
        pattern: &str,
        input_path: &str,
        output_path: &str,
    ) -> Vec<String> {
        let mut base = vec![
            "-y".to_string(),
            "-framerate".to_string(),
            fps_string.to_string(),
            "-i".to_string(),
            pattern.to_string(),
            "-i".to_string(),
            input_path.to_string(),
            "-map".to_string(),
            "0:v:0".to_string(),
            "-map".to_string(),
            "1:a?".to_string(),
        ];

        match self {
            EncoderStrategy::Nvenc => {
                base.extend_from_slice(&[
                    "-c:v".to_string(),
                    "h264_nvenc".to_string(),
                    "-preset".to_string(),
                    "p4".to_string(),
                    "-cq".to_string(),
                    "18".to_string(),
                    "-pix_fmt".to_string(),
                    "yuv420p".to_string(),
                    "-c:a".to_string(),
                    "aac".to_string(),
                    "-b:a".to_string(),
                    "192k".to_string(),
                    "-shortest".to_string(),
                ]);
            }
            EncoderStrategy::Qsv => {
                base.extend_from_slice(&[
                    "-c:v".to_string(),
                    "h264_qsv".to_string(),
                    "-global_quality".to_string(),
                    "20".to_string(),
                    "-pix_fmt".to_string(),
                    "nv12".to_string(),
                    "-c:a".to_string(),
                    "aac".to_string(),
                    "-b:a".to_string(),
                    "192k".to_string(),
                    "-shortest".to_string(),
                ]);
            }
            EncoderStrategy::Amf => {
                base.extend_from_slice(&[
                    "-c:v".to_string(),
                    "h264_amf".to_string(),
                    "-usage".to_string(),
                    "transcoding".to_string(),
                    "-quality".to_string(),
                    "quality".to_string(),
                    "-pix_fmt".to_string(),
                    "yuv420p".to_string(),
                    "-c:a".to_string(),
                    "aac".to_string(),
                    "-b:a".to_string(),
                    "192k".to_string(),
                    "-shortest".to_string(),
                ]);
            }
            EncoderStrategy::Mf => {
                base.extend_from_slice(&[
                    "-c:v".to_string(),
                    "h264_mf".to_string(),
                    "-rate_control".to_string(),
                    "cbr".to_string(),
                    "-b:v".to_string(),
                    "15M".to_string(),
                    "-pix_fmt".to_string(),
                    "yuv420p".to_string(),
                    "-c:a".to_string(),
                    "aac".to_string(),
                    "-b:a".to_string(),
                    "192k".to_string(),
                    "-shortest".to_string(),
                ]);
            }
            EncoderStrategy::Libx264 => {
                base.extend_from_slice(&[
                    "-c:v".to_string(),
                    "libx264".to_string(),
                    "-crf".to_string(),
                    "18".to_string(),
                    "-preset".to_string(),
                    "medium".to_string(),
                    "-pix_fmt".to_string(),
                    "yuv420p".to_string(),
                    "-c:a".to_string(),
                    "aac".to_string(),
                    "-b:a".to_string(),
                    "192k".to_string(),
                    "-shortest".to_string(),
                ]);
            }
            EncoderStrategy::Mpeg4 => {
                base.extend_from_slice(&[
                    "-c:v".to_string(),
                    "mpeg4".to_string(),
                    "-q:v".to_string(),
                    "3".to_string(),
                    "-pix_fmt".to_string(),
                    "yuv420p".to_string(),
                    "-c:a".to_string(),
                    "aac".to_string(),
                    "-b:a".to_string(),
                    "192k".to_string(),
                    "-shortest".to_string(),
                ]);
            }
        }

        base.push(output_path.to_string());
        base
    }
}

pub fn reassemble_with_encoders(
    ctx: &VideoJobContext,
    ffmpeg_binary: &str,
    fps_string: &str,
    normalized_pattern: &str,
) -> Result<(), String> {
    let mut last_err = String::new();

    for &encoder in EncoderStrategy::all() {
        if ctx.is_cancelled() {
            return Err("cancelled".to_string());
        }

        let args = encoder.to_args(
            fps_string,
            normalized_pattern,
            &ctx.job.input_path,
            &ctx.job.output_path,
        );

        let runner = StdProcessRunner::new();
        let handle_res = runner.spawn(&PathBuf::from(ffmpeg_binary), &args);

        let handle = match handle_res {
            Ok(h) => h,
            Err(e) => {
                last_err = format!("Failed to launch FFmpeg encoder {encoder:?}: {e}");
                continue;
            }
        };

        {
            let mut handle_guard = ctx
                .process_handle
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            *handle_guard = Some(handle);
        }

        let mut success = false;
        loop {
            if ctx.is_cancelled() {
                let mut handle_guard = ctx
                    .process_handle
                    .lock()
                    .unwrap_or_else(std::sync::PoisonError::into_inner);
                if let Some(ref mut h) = *handle_guard {
                    let _ = h.kill();
                }
                return Err("cancelled".to_string());
            }

            let mut handle_guard = ctx
                .process_handle
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            if let Some(ref mut h) = *handle_guard {
                match h.try_wait() {
                    Ok(Some(0)) => {
                        success = true;
                        break;
                    }
                    Ok(Some(code)) => {
                        last_err = format!("Encoder {encoder:?} exited with code {code}");
                        break;
                    }
                    Ok(None) => {}
                    Err(e) => {
                        last_err = format!("Error waiting for encoder {encoder:?}: {e}");
                        break;
                    }
                }
            } else {
                break;
            }
            drop(handle_guard);
            thread::sleep(Duration::from_millis(100));
        }

        if success {
            return Ok(());
        }
    }

    Err(format!(
        "All hardware and software video encoders failed. Last error: {last_err}"
    ))
}
