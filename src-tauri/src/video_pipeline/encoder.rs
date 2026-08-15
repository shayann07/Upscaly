use std::path::PathBuf;
use std::sync::Mutex;
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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum AudioMode {
    /// Preserve the source audio stream exactly instead of a lossy
    /// re-encode. Fails outright if the source codec isn't valid inside
    /// the output container (e.g. some PCM/Opus sources in an MP4), in
    /// which case the caller falls back to Transcode.
    Copy,
    Transcode,
}

// Remembers which encoder actually worked last time this process ran a
// reassembly, so the next job tries it first instead of re-probing
// NVENC then QSV then AMF from scratch. On an AMD system, for example,
// every video job previously spawned and failed two ffmpeg processes
// (NVENC, QSV) before reaching the one that actually works -- small but
// pure waste, repeated every single job.
static LAST_SUCCESSFUL_ENCODER: Mutex<Option<EncoderStrategy>> = Mutex::new(None);

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

    /// Candidate order for this run: last time's winner (if any) moved to
    /// the front, followed by the rest of `all()` in their usual order.
    fn candidates() -> Vec<EncoderStrategy> {
        let cached = *LAST_SUCCESSFUL_ENCODER
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);

        let mut ordered = Vec::with_capacity(Self::all().len());
        if let Some(first) = cached {
            ordered.push(first);
        }
        for &enc in Self::all() {
            if Some(enc) != cached {
                ordered.push(enc);
            }
        }
        ordered
    }

    fn record_success(self) {
        if let Ok(mut guard) = LAST_SUCCESSFUL_ENCODER.lock() {
            *guard = Some(self);
        }
    }

    fn video_args(self) -> Vec<String> {
        match self {
            EncoderStrategy::Nvenc => vec![
                "-c:v".to_string(),
                "h264_nvenc".to_string(),
                "-preset".to_string(),
                "p4".to_string(),
                "-cq".to_string(),
                "16".to_string(),
                "-pix_fmt".to_string(),
                "yuv420p".to_string(),
                "-colorspace".to_string(),
                "bt709".to_string(),
                "-color_primaries".to_string(),
                "bt709".to_string(),
                "-color_trc".to_string(),
                "bt709".to_string(),
            ],
            EncoderStrategy::Qsv => vec![
                "-c:v".to_string(),
                "h264_qsv".to_string(),
                "-global_quality".to_string(),
                "16".to_string(),
                "-pix_fmt".to_string(),
                "nv12".to_string(),
            ],
            EncoderStrategy::Amf => vec![
                "-c:v".to_string(),
                "h264_amf".to_string(),
                "-usage".to_string(),
                "transcoding".to_string(),
                "-quality".to_string(),
                "quality".to_string(),
                "-pix_fmt".to_string(),
                "yuv420p".to_string(),
            ],
            EncoderStrategy::Mf => vec![
                "-c:v".to_string(),
                "h264_mf".to_string(),
                "-rate_control".to_string(),
                "cbr".to_string(),
                "-b:v".to_string(),
                "60M".to_string(),
                "-pix_fmt".to_string(),
                "yuv420p".to_string(),
            ],
            EncoderStrategy::Libx264 => vec![
                "-c:v".to_string(),
                "libx264".to_string(),
                "-crf".to_string(),
                "16".to_string(),
                "-preset".to_string(),
                "medium".to_string(),
                "-pix_fmt".to_string(),
                "yuv420p".to_string(),
                "-colorspace".to_string(),
                "bt709".to_string(),
                "-color_primaries".to_string(),
                "bt709".to_string(),
                "-color_trc".to_string(),
                "bt709".to_string(),
            ],
            EncoderStrategy::Mpeg4 => vec![
                "-c:v".to_string(),
                "mpeg4".to_string(),
                "-q:v".to_string(),
                "2".to_string(),
                "-pix_fmt".to_string(),
                "yuv420p".to_string(),
            ],
        }
    }

    fn to_args(
        self,
        fps_string: &str,
        pattern: &str,
        input_path: &str,
        output_path: &str,
        audio_mode: AudioMode,
    ) -> Vec<String> {
        let mut args = vec![
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

        args.extend(self.video_args());

        match audio_mode {
            // Preserve the source audio exactly instead of a generational
            // quality loss from a needless lossy re-encode -- the vast
            // majority of sources already carry AAC/AC3 audio that's
            // already valid inside an MP4 container.
            AudioMode::Copy => {
                args.push("-c:a".to_string());
                args.push("copy".to_string());
            }
            AudioMode::Transcode => {
                args.push("-c:a".to_string());
                args.push("aac".to_string());
                args.push("-b:a".to_string());
                args.push("256k".to_string());
            }
        }

        args.push("-shortest".to_string());
        args.push(output_path.to_string());
        args
    }
}

pub fn reassemble_with_encoders(
    ctx: &VideoJobContext,
    ffmpeg_binary: &str,
    fps_string: &str,
    normalized_pattern: &str,
) -> Result<(), String> {
    let mut last_err = String::new();
    let candidates = EncoderStrategy::candidates();

    // Try every encoder with audio stream-copy first; only if none of them
    // can produce a valid file that way (a source codec unions container
    // requirements, or a hardware encoder is unavailable) fall back to a
    // second full pass that always re-encodes audio to AAC, matching the
    // previous unconditional behavior as the guaranteed-to-work path.
    for audio_mode in [AudioMode::Copy, AudioMode::Transcode] {
        for &encoder in &candidates {
            if ctx.is_cancelled() {
                return Err("cancelled".to_string());
            }

            let args = encoder.to_args(
                fps_string,
                normalized_pattern,
                &ctx.job.input_path,
                &ctx.job.output_path,
                audio_mode,
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
                encoder.record_success();
                return Ok(());
            }
        }
    }

    Err(format!(
        "All hardware and software video encoders failed. Last error: {last_err}"
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_candidates_tries_last_successful_encoder_first() {
        // No other test in this crate touches LAST_SUCCESSFUL_ENCODER, so
        // this is safe under cargo test's default parallel execution.
        *LAST_SUCCESSFUL_ENCODER
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = None;

        // With nothing cached yet, candidates() is just all() unchanged.
        let fresh = EncoderStrategy::candidates();
        assert_eq!(fresh, EncoderStrategy::all().to_vec());

        // Simulate AMF having worked last time.
        EncoderStrategy::Amf.record_success();
        let reordered = EncoderStrategy::candidates();

        assert_eq!(reordered[0], EncoderStrategy::Amf);
        assert_eq!(reordered.len(), EncoderStrategy::all().len());
        // Every strategy still appears exactly once -- nothing dropped or
        // duplicated by moving the cached winner to the front.
        for &enc in EncoderStrategy::all() {
            assert_eq!(reordered.iter().filter(|&&e| e == enc).count(), 1);
        }

        // Reset so this test's side effect can't leak into a future run
        // within the same process (cargo test reuses the binary across
        // `cargo test -- --test-threads` runs but not across invocations,
        // so this matters only for repeated `--nocapture` style re-runs).
        *LAST_SUCCESSFUL_ENCODER
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = None;
    }

    #[test]
    fn test_to_args_uses_copy_or_transcode_audio_codec() {
        let copy_args =
            EncoderStrategy::Libx264.to_args("30/1", "frame_%08d.jpg", "in.mp4", "out.mp4", AudioMode::Copy);
        let transcode_args = EncoderStrategy::Libx264.to_args(
            "30/1",
            "frame_%08d.jpg",
            "in.mp4",
            "out.mp4",
            AudioMode::Transcode,
        );

        assert!(copy_args.windows(2).any(|w| w == ["-c:a", "copy"]));
        assert!(!copy_args.contains(&"aac".to_string()));

        assert!(transcode_args.windows(2).any(|w| w == ["-c:a", "aac"]));
        assert!(transcode_args.windows(2).any(|w| w == ["-b:a", "256k"]));
    }
}
