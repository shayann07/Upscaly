use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use crate::process_runner::{ProcessHandle, ProcessRunner, StdProcessRunner};
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

// Every strategy below encodes 4:2:0 chroma (yuv420p, or nv12 for QSV),
// which cannot represent an odd frame width or height. Any source whose
// upscaled dimensions land odd -- e.g. a 3x model on 853x480 giving
// 2559x1440 -- made *every* encoder in the candidate list fail with
// "width not divisible by 2", killing the job only after the entire
// (potentially hour-long) upscale had already completed. Pad up to the
// next even dimension instead of scaling or cropping, so the fix costs
// at most a single row/column of black edge pixels and never resamples
// or discards real image data.
const EVEN_DIMENSION_PAD: &str = "pad=ceil(iw/2)*2:ceil(ih/2)*2";

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

    /// Args for reading frames from stdin instead of a numbered file pattern.
    ///
    /// Same output configuration as [`Self::to_args`]; only the input source
    /// differs. `image2pipe` needs the framerate declared exactly as the
    /// pattern form does, since piped JPEGs carry no timing of their own.
    fn to_streaming_args(
        self,
        fps_string: &str,
        input_path: &str,
        output_path: &str,
        audio_mode: AudioMode,
    ) -> Vec<String> {
        let mut args = vec![
            "-y".to_string(),
            "-f".to_string(),
            "image2pipe".to_string(),
            "-framerate".to_string(),
            fps_string.to_string(),
            "-i".to_string(),
            "-".to_string(),
        ];
        args.extend(self.common_output_args(input_path, output_path, audio_mode));
        args
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
        ];
        args.extend(self.common_output_args(input_path, output_path, audio_mode));
        args
    }

    /// Everything after the frame source: the audio input, stream mapping,
    /// the even-dimension pad, codec settings and the output path. Shared so
    /// the pattern and streaming paths cannot drift in what they produce.
    fn common_output_args(
        self,
        input_path: &str,
        output_path: &str,
        audio_mode: AudioMode,
    ) -> Vec<String> {
        let mut args = vec![
            "-i".to_string(),
            input_path.to_string(),
            "-map".to_string(),
            "0:v:0".to_string(),
            "-map".to_string(),
            "1:a?".to_string(),
            "-vf".to_string(),
            EVEN_DIMENSION_PAD.to_string(),
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

/// Finds an encoder + audio-mode combination that actually works here, by
/// encoding a single frame.
///
/// The pattern-based path can afford to discover this by trying each
/// combination on the real job and letting failures fall through. Streaming
/// cannot: frames are consumed (and deleted) as they are fed, so there is no
/// second attempt. Probing with one frame keeps the fallback ladder's
/// coverage at a fraction of its cost, and the `LAST_SUCCESSFUL_ENCODER`
/// cache means the first candidate is usually the right one.
fn probe_combination(
    ctx: &VideoJobContext,
    ffmpeg_binary: &str,
    fps_string: &str,
    sample_frame: &Path,
) -> Option<(EncoderStrategy, AudioMode)> {
    let probe_output = ctx.job_temp_dir.join("encoder_probe.mp4");
    let sample = std::fs::read(sample_frame).ok()?;

    for audio_mode in [AudioMode::Copy, AudioMode::Transcode] {
        for &encoder in &EncoderStrategy::candidates() {
            if ctx.is_cancelled() {
                return None;
            }

            let args = encoder.to_streaming_args(
                fps_string,
                &ctx.job.input_path,
                &probe_output.to_string_lossy(),
                audio_mode,
            );

            let runner = StdProcessRunner::new();
            let Ok((mut handle, mut stdin)) =
                runner.spawn_with_stdin(&PathBuf::from(ffmpeg_binary), &args)
            else {
                continue;
            };

            let wrote = stdin.write_all(&sample).is_ok();
            // EOF after one frame: ffmpeg encodes it and exits.
            drop(stdin);

            let mut succeeded = false;
            if wrote {
                let deadline = std::time::Instant::now() + Duration::from_secs(20);
                loop {
                    match handle.try_wait() {
                        Ok(Some(0)) => {
                            succeeded = true;
                            break;
                        }
                        Ok(Some(_)) | Err(_) => break,
                        Ok(None) => {
                            if std::time::Instant::now() > deadline {
                                let _ = handle.kill();
                                break;
                            }
                            thread::sleep(Duration::from_millis(50));
                        }
                    }
                }
            }
            if !succeeded {
                let _ = handle.kill();
            }

            let _ = std::fs::remove_file(&probe_output);
            if succeeded {
                return Some((encoder, audio_mode));
            }
        }
    }
    None
}

/// Reassembles by piping frames into ffmpeg over stdin, deleting each frame
/// once it has been fed.
///
/// The pattern-based path requires every upscaled frame to still be on disk
/// when reassembly starts, so peak usage is the whole decoded video. Feeding
/// and deleting incrementally keeps only the untouched tail resident.
pub fn reassemble_streaming(
    ctx: &VideoJobContext,
    ffmpeg_binary: &str,
    fps_string: &str,
    frames: Vec<PathBuf>,
) -> Result<(), String> {
    let Some(sample_frame) = frames.first().cloned() else {
        return Err("No upscaled frames to reassemble.".to_string());
    };

    let (encoder, audio_mode) = probe_combination(ctx, ffmpeg_binary, fps_string, &sample_frame)
        .ok_or_else(|| {
            "All hardware and software video encoders failed to start.".to_string()
        })?;
    encoder.record_success();

    let args = encoder.to_streaming_args(
        fps_string,
        &ctx.job.input_path,
        &ctx.job.output_path,
        audio_mode,
    );

    let runner = StdProcessRunner::new();
    let (handle, mut stdin) = runner
        .spawn_with_stdin(&PathBuf::from(ffmpeg_binary), &args)
        .map_err(|e| format!("Failed to launch FFmpeg encoder {encoder:?}: {e}"))?;

    {
        let mut guard = ctx
            .process_handle
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        *guard = Some(Box::new(handle));
    }

    let total = frames.len();
    let fed = Arc::new(AtomicUsize::new(0));
    let fed_writer = Arc::clone(&fed);
    let cancel = Arc::clone(&ctx.cancel_requested);

    // Feed on its own thread. If ffmpeg dies early it stops draining stdin
    // and a write blocks indefinitely, so the polling loop below has to stay
    // free to notice that and kill the process.
    let feeder = thread::spawn(move || {
        for frame in frames {
            if cancel.load(Ordering::SeqCst) {
                break;
            }
            let Ok(bytes) = std::fs::read(&frame) else {
                continue;
            };
            if stdin.write_all(&bytes).is_err() {
                break;
            }
            let _ = std::fs::remove_file(&frame);
            fed_writer.fetch_add(1, Ordering::SeqCst);
        }
        // Dropping stdin is the EOF signal; without it ffmpeg waits forever.
        drop(stdin);
    });

    let result = loop {
        if ctx.is_cancelled() {
            let mut guard = ctx
                .process_handle
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            if let Some(ref mut h) = *guard {
                let _ = h.kill();
            }
            break Err("cancelled".to_string());
        }

        let status = {
            let mut guard = ctx
                .process_handle
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            match guard.as_mut() {
                Some(h) => h.try_wait(),
                None => break Ok(()),
            }
        };

        match status {
            Ok(Some(0)) => break Ok(()),
            Ok(Some(code)) => {
                break Err(format!("Encoder {encoder:?} exited with code {code}"));
            }
            Err(e) => break Err(format!("Error waiting for encoder {encoder:?}: {e}")),
            Ok(None) => {}
        }

        #[allow(clippy::cast_precision_loss)]
        let ratio = fed.load(Ordering::SeqCst) as f64 / total.max(1) as f64;
        ctx.emit_progress(
            92.0 + (ratio * 7.0).min(7.0),
            "Reassembling Video & Merging Audio Stream...",
        );
        thread::sleep(Duration::from_millis(100));
    };

    let _ = feeder.join();
    result
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

    #[test]
    fn test_streaming_and_pattern_paths_agree_on_output_config() {
        // The two input forms must differ only in how frames arrive. If they
        // drift, streamed video would silently get different codec, colour or
        // audio handling than the pattern fallback produces.
        for &encoder in EncoderStrategy::all() {
            for audio_mode in [AudioMode::Copy, AudioMode::Transcode] {
                let pattern =
                    encoder.to_args("30/1", "frame_%08d.jpg", "in.mp4", "out.mp4", audio_mode);
                let streaming =
                    encoder.to_streaming_args("30/1", "in.mp4", "out.mp4", audio_mode);

                // Everything from the audio input onward is shared verbatim.
                let tail_of = |args: &[String]| {
                    let idx = args.iter().position(|a| a == "-map").expect("-map present");
                    args[idx..].to_vec()
                };
                assert_eq!(
                    tail_of(&pattern),
                    tail_of(&streaming),
                    "{encoder:?}/{audio_mode:?} output config diverged between input forms"
                );
            }
        }
    }

    #[test]
    fn test_streaming_args_read_frames_from_stdin() {
        let args =
            EncoderStrategy::Libx264.to_streaming_args("30/1", "in.mp4", "out.mp4", AudioMode::Copy);

        assert!(args.windows(2).any(|w| w == ["-f", "image2pipe"]));
        // Frame source is stdin, and the framerate must still be declared:
        // piped JPEGs carry no timing of their own.
        assert!(args.windows(2).any(|w| w == ["-i", "-"]));
        assert!(args.windows(2).any(|w| w == ["-framerate", "30/1"]));
        // The original file is still opened as the audio source.
        assert!(args.windows(2).any(|w| w == ["-i", "in.mp4"]));
    }

    #[test]
    fn test_every_encoder_pads_to_even_dimensions() {
        // All strategies encode 4:2:0 chroma, which cannot represent odd
        // frame dimensions -- without this filter an odd-sized upscale
        // (e.g. 3x on 853x480) fails every encoder in the list after the
        // full upscale has already run.
        for &encoder in EncoderStrategy::all() {
            for audio_mode in [AudioMode::Copy, AudioMode::Transcode] {
                let args =
                    encoder.to_args("30/1", "frame_%08d.jpg", "in.mp4", "out.mp4", audio_mode);
                assert!(
                    args.windows(2).any(|w| w[0] == "-vf" && w[1] == EVEN_DIMENSION_PAD),
                    "{encoder:?} with {audio_mode:?} audio is missing the even-dimension pad filter"
                );
                // Exactly one -vf: a second would silently override the first.
                assert_eq!(
                    args.iter().filter(|a| *a == "-vf").count(),
                    1,
                    "{encoder:?} should pass exactly one -vf filter chain"
                );
            }
        }
    }
}
