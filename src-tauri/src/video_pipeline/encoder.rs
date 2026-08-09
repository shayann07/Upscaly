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
    pub fn as_str(&self) -> &'static str {
        match self {
            EncoderStrategy::Nvenc => "h264_nvenc",
            EncoderStrategy::Qsv => "h264_qsv",
            EncoderStrategy::Amf => "h264_amf",
            EncoderStrategy::Mf => "h264_mf",
            EncoderStrategy::Libx264 => "libx264",
            EncoderStrategy::Mpeg4 => "mpeg4",
        }
    }

    pub const ALL: &'static [EncoderStrategy] = &[
        EncoderStrategy::Nvenc,
        EncoderStrategy::Qsv,
        EncoderStrategy::Amf,
        EncoderStrategy::Mf,
        EncoderStrategy::Libx264,
        EncoderStrategy::Mpeg4,
    ];
}

pub fn reassemble_with_encoders(
    ctx: &VideoJobContext,
    ffmpeg_binary: &str,
    fps_string: &str,
    normalized_pattern: &str,
) -> Result<(), String> {
    let runner = StdProcessRunner::new();
    let mut reassemble_success = false;
    let mut last_error_log = String::new();

    for strategy in EncoderStrategy::ALL {
        if ctx.is_cancelled() {
            return Err("cancelled".to_string());
        }

        let encoder_name = strategy.as_str();

        // 1. Try audio pass-through (-c:a copy)
        let copy_args = vec![
            "-y".to_string(),
            "-framerate".to_string(),
            fps_string.to_string(),
            "-start_number".to_string(),
            "1".to_string(),
            "-i".to_string(),
            normalized_pattern.to_string(),
            "-i".to_string(),
            ctx.job.input_path.clone(),
            "-c:v".to_string(),
            encoder_name.to_string(),
            "-pix_fmt".to_string(),
            "yuv420p".to_string(),
            "-c:a".to_string(),
            "copy".to_string(),
            "-map".to_string(),
            "0:v:0".to_string(),
            "-map".to_string(),
            "1:a:0?".to_string(),
            ctx.job.output_path.clone(),
        ];

        if let Ok(mut h) = runner.spawn(&PathBuf::from(ffmpeg_binary), &copy_args) {
            let mut success = false;
            loop {
                if ctx.is_cancelled() {
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

        // 2. Fallback to AAC 192k stereo
        let aac_args = vec![
            "-y".to_string(),
            "-framerate".to_string(),
            fps_string.to_string(),
            "-start_number".to_string(),
            "1".to_string(),
            "-i".to_string(),
            normalized_pattern.to_string(),
            "-i".to_string(),
            ctx.job.input_path.clone(),
            "-c:v".to_string(),
            encoder_name.to_string(),
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
            ctx.job.output_path.clone(),
        ];

        if let Ok(mut h) = runner.spawn(&PathBuf::from(ffmpeg_binary), &aac_args) {
            let mut success = false;
            loop {
                if ctx.is_cancelled() {
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

        // 3. Fallback to video-only
        let video_only_args = vec![
            "-y".to_string(),
            "-framerate".to_string(),
            fps_string.to_string(),
            "-start_number".to_string(),
            "1".to_string(),
            "-i".to_string(),
            normalized_pattern.to_string(),
            "-c:v".to_string(),
            encoder_name.to_string(),
            "-pix_fmt".to_string(),
            "yuv420p".to_string(),
            ctx.job.output_path.clone(),
        ];

        if let Ok(mut h) = runner.spawn(&PathBuf::from(ffmpeg_binary), &video_only_args) {
            let mut success = false;
            loop {
                if ctx.is_cancelled() {
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
        let msg = if last_error_log.is_empty() {
            "No supported H.264 video encoder available (tried h264_nvenc, h264_qsv, h264_amf, h264_mf, libx264, mpeg4).".to_string()
        } else {
            format!(
                "No supported H.264 video encoder available. FFmpeg error output: {}",
                last_error_log
            )
        };
        return Err(msg);
    }

    Ok(())
}
