use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExecutionProfile {
    pub tile_size: i32,
    pub thread_arg: String,
    pub projected_vram_mb: u64,
    pub proc_threads: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ts_rs::TS)]
#[ts(export, export_to = "../../src/lib/ipc/")]
pub struct VramProfile {
    #[ts(type = "number")]
    pub total_vram_mb: u64,
    #[ts(type = "number")]
    pub used_vram_mb: u64,
    pub safe_tile_size: i32,
    pub auto_tile_size: i32,
    pub proc_threads: u32,
    pub thread_arg: String,
    pub is_overflowing: bool,
    pub status_message: String,
}

/// Model weights, loaded once per process regardless of thread count.
const MODEL_WEIGHTS_MB: u64 = 400;

/// realesrgan-ncnn-vulkan pads each tile by 10px on every side before
/// feeding it to the network, so the tensors are sized off `tile + 2*PREPAD`
/// rather than `tile`.
const PREPAD: i32 = 10;

/// Bytes of device memory per *input-resolution* pixel, covering the RRDB
/// trunk's live feature maps (64 channels at fp16, with the dense
/// concatenations inside each residual block keeping several blobs
/// resident at once).
const INPUT_BYTES_PER_PX: f64 = 900.0;

/// Bytes of device memory per *output-resolution* pixel. The upsampling tail
/// runs at `tile * scale` in both dimensions, so this term grows with the
/// square of the scale factor and dominates everything else at 4x.
const OUTPUT_BYTES_PER_PX: f64 = 1100.0;

const BYTES_PER_MB: f64 = 1024.0 * 1024.0;

/// Calculate total projected VRAM usage for a tile at a given output scale.
///
/// # Why this takes `scale`
///
/// The previous formula was `400 + (tile/100)^2 * 130` -- purely a function
/// of the *input* tile size. That is structurally wrong: the expensive part
/// of the network is the upsampling tail, which runs at `tile * scale`
/// resolution. A 512px tile at 4x costs four times what the same tile costs
/// at 2x, and the old formula priced them identically.
///
/// The practical consequence was not academic. On a 6GB laptop card the old
/// estimate put a 512px tile at 4x at 3808 MB, comfortably under the
/// 4608 MB ceiling, so the governor handed it straight through. The actual
/// run exhausted device memory and took the display driver with it:
///
/// ```text
/// vkAllocateMemory failed -2      // VK_ERROR_OUT_OF_DEVICE_MEMORY
/// vkWaitForFences failed -4       // VK_ERROR_DEVICE_LOST
/// ```
///
/// The constants above are calibrated so that configuration is rejected,
/// with margin -- they are a deliberately conservative bound anchored on
/// that one measured failure, not a curve fitted to many measurements. When
/// they are wrong they should be wrong in the direction of a smaller tile.
/// [`is_vram_exhaustion`] is the backstop for when they are wrong anyway.
///
/// The model's base weights are counted once per *process*, not per GPU
/// worker thread -- `-j 1:N:2` spawns N processing threads inside a single
/// process sharing one copy of the weights. Only the compute buffers
/// duplicate per thread.
#[must_use]
#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
pub fn estimate_total_vram_mb(tile_size: i32, proc_threads: u32, scale: i32) -> u64 {
    let t = f64::from(tile_size.clamp(32, 1024));
    let s = f64::from(scale.clamp(1, 8));
    let padded = t + f64::from(2 * PREPAD);

    let input_mb = padded.powi(2) * INPUT_BYTES_PER_PX / BYTES_PER_MB;
    let output_mb = (t * s).powi(2) * OUTPUT_BYTES_PER_PX / BYTES_PER_MB;

    let single_buffer_mb = (input_mb + output_mb).round() as u64;
    MODEL_WEIGHTS_MB + single_buffer_mb * u64::from(proc_threads.max(1))
}

/// One tile step below `tile`, for gentle mode.
///
/// Strictly downward on the same ladder the governor itself selects from,
/// so gentle mode can only ever reduce the working set -- it composes with
/// the governor rather than second-guessing it. AUTO (0) maps to a concrete
/// 256 because "gentler than an engine-chosen unknown" is not expressible;
/// a known-moderate tile is.
#[must_use]
pub fn gentle_tile(tile: i32) -> i32 {
    const LADDER: [i32; 7] = [512, 384, 256, 192, 128, 96, 64];
    if tile <= 0 {
        return 256;
    }
    LADDER.iter().copied().find(|&t| t < tile).unwrap_or(64)
}

/// Whether a sidecar's stderr shows the GPU has run out of memory or the
/// driver has already lost the device.
///
/// This has to be checked *while the process is alive*, not after it exits.
/// realesrgan-ncnn-vulkan does not abort on a failed allocation -- it logs
/// and keeps submitting work to a device it can no longer feed:
///
/// ```text
/// vkAllocateMemory failed -2
/// vkWaitForFences failed -4
/// 0.00%
/// vkQueueSubmit failed -4
/// 25.00%
/// vkQueueSubmit failed -4
/// ```
///
/// On a laptop whose display is driven by that same GPU, the resulting
/// thrash hangs the compositor and the machine stops responding entirely --
/// the process never exits, so any check gated on exit never runs.
#[must_use]
pub fn is_vram_exhaustion(stderr: &str) -> bool {
    const SIGNATURES: [&str; 7] = [
        "vkAllocateMemory failed",
        "vkQueueSubmit failed",
        "vkWaitForFences failed",
        "vkMapMemory failed",
        "vkCreateBuffer failed",
        "vkCreateImage failed",
        "out of device memory",
    ];
    SIGNATURES.iter().any(|sig| stderr.contains(sig))
}

/// The error every caller raises after [`is_vram_exhaustion`] fires, naming
/// the tile that failed and a concrete smaller one to retry with.
#[must_use]
pub fn vram_exhausted_error(tile_size: i32) -> crate::error::AppError {
    let next = if tile_size <= 0 {
        256
    } else {
        (tile_size / 2).max(64)
    };
    let attempted = if tile_size <= 0 {
        "AUTO".to_string()
    } else {
        format!("{tile_size}px")
    };
    crate::error::AppError::GpuError {
        message: format!(
            "The GPU ran out of memory at a {attempted} tile and the job was stopped \
             to keep the display driver alive. Try {next}px."
        ),
    }
}

/// Usable VRAM budget for upscaling, reserving headroom for OS/DWM display
/// compositing (25%, or a fixed slice on small cards).
///
/// Public so callers deciding whether *two* things can be resident at once --
/// e.g. overlapping one batch's NCNN process with the next one's startup --
/// can test against the same ceiling the profile itself was sized against,
/// rather than inventing a second budget that could drift from this one.
#[must_use]
#[allow(
    clippy::cast_precision_loss,
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss
)]
pub fn safe_vram_ceiling_mb(gpu_vram_mb: u64) -> u64 {
    if gpu_vram_mb <= 1024 {
        gpu_vram_mb.saturating_sub(200).max(300)
    } else if gpu_vram_mb <= 2048 {
        gpu_vram_mb.saturating_sub(450).max(600)
    } else {
        (gpu_vram_mb as f64 * 0.75).round() as u64
    }
}

/// Determine the maximum safe tile size and thread configuration for a given GPU VRAM budget.
///
/// Ensures total VRAM stays strictly below `0.75 * gpu_vram_mb` to leave generous headroom for OS/DWM.
#[must_use]
#[allow(
    clippy::cast_precision_loss,
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss
)]
pub fn calculate_safe_execution_profile(
    gpu_vram_mb: u64,
    requested_tile: i32,
    scale: i32,
    _is_video: bool,
) -> ExecutionProfile {
    let safe_ceiling_mb = safe_vram_ceiling_mb(gpu_vram_mb);

    if requested_tile <= 0 {
        let (thread_arg, proc_threads, projected_vram_mb) = if gpu_vram_mb >= 10240 {
            ("1:2:2".to_string(), 2, 4500)
        } else if gpu_vram_mb <= 2048 {
            ("1:1:1".to_string(), 1, 900)
        } else {
            ("1:1:2".to_string(), 1, 2300)
        };

        return ExecutionProfile {
            tile_size: 0,
            thread_arg,
            projected_vram_mb,
            proc_threads,
        };
    }

    let target_tile = ((requested_tile / 32) * 32).clamp(32, 1024);

    // Candidate tile sizes to test (step down if user requested tile exceeds safe ceiling)
    let candidate_tiles = [target_tile, 512, 384, 256, 192, 128, 96, 64, 32];

    for &tile in &candidate_tiles {
        if tile > target_tile {
            continue;
        }

        // Dual GPU pipelines (proc = 2) ONLY allowed for large desktop GPUs >= 10GB (10240MB).
        //
        // estimate_total_vram_mb was previously overstating dual-proc usage
        // (double-counting the model's base weights per thread instead of
        // once per process), which an audit flagged as the likely reason
        // this 10GB floor is more conservative than it needs to be -- on
        // paper, 6-8GB GPUs have headroom for dual-proc once the estimate
        // is corrected. That floor was deliberately hardened in a prior
        // commit specifically because dual-proc caused real stability
        // problems on 6-8GB GPUs, and this fix has no way to validate
        // "corrected math == actually safe on that hardware" without
        // testing on it. So: the math bug above is fixed (it was simply
        // wrong, independent of any policy question, and every existing
        // profile below this gate is proc=1, where the bug had no effect
        // at all), but this floor stays as the prior commit set it rather
        // than being loosened on an unverified assumption.
        let dual_thread_vram = estimate_total_vram_mb(tile, 2, scale);
        if dual_thread_vram <= safe_ceiling_mb && gpu_vram_mb >= 10240 {
            return ExecutionProfile {
                tile_size: tile,
                thread_arg: "1:2:2".to_string(),
                projected_vram_mb: dual_thread_vram,
                proc_threads: 2,
            };
        }

        // Single GPU pipeline (proc = 1) for all GPUs <= 8GB (including 6GB laptops)
        let single_thread_vram = estimate_total_vram_mb(tile, 1, scale);
        if single_thread_vram <= safe_ceiling_mb || tile <= 64 {
            return ExecutionProfile {
                tile_size: tile,
                thread_arg: "1:1:2".to_string(),
                projected_vram_mb: single_thread_vram,
                proc_threads: 1,
            };
        }
    }

    // Ultra-low fallback
    ExecutionProfile {
        tile_size: 32,
        thread_arg: "1:1:1".to_string(),
        projected_vram_mb: estimate_total_vram_mb(32, 1, scale),
        proc_threads: 1,
    }
}

#[must_use]
#[allow(clippy::cast_precision_loss)]
pub fn build_vram_profile(gpu_vram_mb: u64, requested_tile: i32, scale: i32) -> VramProfile {
    let auto_profile = calculate_safe_execution_profile(gpu_vram_mb, 0, scale, false);
    let selected_profile =
        calculate_safe_execution_profile(gpu_vram_mb, requested_tile, scale, false);

    let is_overflowing = selected_profile.projected_vram_mb > gpu_vram_mb;
    let total_gb = gpu_vram_mb as f64 / 1024.0;
    let used_gb = selected_profile.projected_vram_mb as f64 / 1024.0;

    let tile_size = selected_profile.tile_size;
    let status_message = if requested_tile == 0 {
        format!(
            "AUTO dynamically tunes tile size via Vulkan hardware heaps (Single-Thread Safe Mode) · Projected: {used_gb:.1} GB / {total_gb:.1} GB."
        )
    } else if selected_profile.tile_size < requested_tile {
        format!(
            "Clamped to {tile_size}px (Single-Thread Safe Mode) to prevent VRAM overflow ({used_gb:.1} GB / {total_gb:.1} GB)."
        )
    } else if selected_profile.proc_threads == 1 {
        format!(
            "Selected {tile_size}px tile (Single-Thread Safe Mode) · Projected: {used_gb:.1} GB / {total_gb:.1} GB."
        )
    } else {
        format!(
            "Selected {tile_size}px tile (Dual-Thread Accelerated) · Projected: {used_gb:.1} GB / {total_gb:.1} GB."
        )
    };

    VramProfile {
        total_vram_mb: gpu_vram_mb,
        used_vram_mb: selected_profile.projected_vram_mb,
        safe_tile_size: selected_profile.tile_size,
        auto_tile_size: auto_profile.tile_size,
        proc_threads: selected_profile.proc_threads,
        thread_arg: selected_profile.thread_arg,
        is_overflowing,
        status_message,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_estimate_total_vram_counts_base_weights_once_not_per_thread() {
        // The model's weights load once per process regardless of how many
        // GPU worker threads that process runs -- only the per-tile
        // compute buffer scales with thread count.
        let single = estimate_total_vram_mb(256, 1, 4);
        let dual = estimate_total_vram_mb(256, 2, 4);
        let buffer = single - MODEL_WEIGHTS_MB;

        assert_eq!(dual, MODEL_WEIGHTS_MB + buffer * 2);
        // The old buggy formula ((400 + buffer) * threads) would have put
        // dual at 400 + buffer*2 + 400 = 400 more than the correct figure.
        assert_eq!(dual, single + buffer);
    }

    #[test]
    fn test_estimate_scales_with_the_output_factor_not_just_the_tile() {
        // The regression this pins: the estimate used to be a function of
        // the input tile alone, so 512@2x and 512@4x priced identically
        // even though the upsampling tail runs at four times the area.
        let at_2x = estimate_total_vram_mb(512, 1, 2);
        let at_4x = estimate_total_vram_mb(512, 1, 4);
        assert!(
            at_4x > at_2x * 2,
            "4x must cost far more than 2x at the same tile: {at_2x} vs {at_4x}"
        );
    }

    #[test]
    fn test_vram_governor_6gb_gpu_refuses_512_tile_at_4x() {
        // The configuration that hard-locked a 6GB RTX 3050 laptop: the old
        // governor projected 3808 MB against a 4608 MB ceiling and allowed
        // it, the real run exhausted device memory and lost the display
        // driver. It must now clamp below 512.
        let profile = calculate_safe_execution_profile(6144, 512, 4, false);
        assert!(
            profile.tile_size < 512,
            "512 at 4x must be clamped on a 6GB card, got {}",
            profile.tile_size
        );
        assert_eq!(profile.proc_threads, 1);
        assert!(profile.projected_vram_mb <= safe_vram_ceiling_mb(6144));
    }

    #[test]
    fn test_vram_governor_6gb_gpu_allows_512_tile_at_2x() {
        // Same tile, half the output factor, a quarter of the upsampling
        // cost -- this one genuinely fits, and clamping it would be leaving
        // quality on the table for no reason.
        let profile = calculate_safe_execution_profile(6144, 512, 2, false);
        assert_eq!(profile.tile_size, 512);
        assert!(profile.projected_vram_mb <= safe_vram_ceiling_mb(6144));
    }

    #[test]
    fn test_vram_governor_6gb_gpu_384_tile() {
        // On a 6GB GPU, 384 tile at 4x runs proc = 1 and stays inside the
        // ceiling with room to spare.
        let profile = calculate_safe_execution_profile(6144, 384, 4, false);
        assert_eq!(profile.tile_size, 384);
        assert_eq!(profile.proc_threads, 1);
        assert_eq!(profile.thread_arg, "1:1:2");
        assert!(profile.projected_vram_mb <= safe_vram_ceiling_mb(6144));
    }

    #[test]
    fn test_vram_governor_12gb_gpu_512_tile() {
        // This previously asserted proc = 2. That expectation encoded the
        // old under-estimate: with the corrected scale-aware figure, two
        // concurrent 512@4x pipelines want ~9.7GB against a 9.2GB ceiling.
        // Single-proc at 512 is the honest answer for a 12GB card, and
        // dual-proc still applies at the smaller tiles below.
        let profile = calculate_safe_execution_profile(12288, 512, 4, false);
        assert_eq!(profile.tile_size, 512);
        assert_eq!(profile.proc_threads, 1);
        assert!(profile.projected_vram_mb <= safe_vram_ceiling_mb(12288));

        let smaller = calculate_safe_execution_profile(12288, 256, 4, false);
        assert_eq!(smaller.tile_size, 256);
        assert_eq!(smaller.proc_threads, 2);
        assert_eq!(smaller.thread_arg, "1:2:2");
    }

    #[test]
    fn test_vram_governor_2gb_integrated_gpu() {
        // On a 2GB Intel GPU (2048 MB), requesting 512 tile clamps down safely
        let profile = calculate_safe_execution_profile(2048, 512, 4, false);
        assert!(profile.tile_size <= 256);
        assert_eq!(profile.proc_threads, 1);
        assert!(profile.projected_vram_mb <= 1700);
    }

    #[test]
    fn test_vram_governor_512mb_gpu() {
        // On a 512MB legacy GPU, clamped to 32-64px
        let profile = calculate_safe_execution_profile(512, 256, 4, false);
        assert!(profile.tile_size <= 64);
        assert_eq!(profile.proc_threads, 1);
    }

    #[test]
    fn test_every_permitted_profile_fits_under_the_ceiling() {
        // The property that actually matters, swept rather than spot-checked:
        // whatever the governor returns must fit the budget it was sized
        // against. The one exemption is the >=32px floor, where there is no
        // smaller tile left to fall back to.
        for &vram in &[1024u64, 2048, 4096, 6144, 8192, 12288, 24576] {
            for &tile in &[0i32, 32, 64, 128, 192, 256, 384, 512, 1024] {
                for &scale in &[1i32, 2, 3, 4] {
                    let p = calculate_safe_execution_profile(vram, tile, scale, false);
                    if p.tile_size <= 64 || p.tile_size == 0 {
                        continue;
                    }
                    assert!(
                        p.projected_vram_mb <= safe_vram_ceiling_mb(vram),
                        "vram={vram} tile={tile} scale={scale} -> {}px projected {}MB \
                         exceeds ceiling {}MB",
                        p.tile_size,
                        p.projected_vram_mb,
                        safe_vram_ceiling_mb(vram)
                    );
                }
            }
        }
    }

    #[test]
    fn test_vram_governor_auto_mode() {
        let p6 = calculate_safe_execution_profile(6144, 0, 4, true);
        assert_eq!(p6.tile_size, 0);
        assert_eq!(p6.proc_threads, 1);
        assert_eq!(p6.thread_arg, "1:1:2");

        let p2 = calculate_safe_execution_profile(2048, 0, 4, false);
        assert_eq!(p2.tile_size, 0);
        assert_eq!(p2.proc_threads, 1);
        assert_eq!(p2.thread_arg, "1:1:1");

        let p12 = calculate_safe_execution_profile(12288, 0, 4, true);
        assert_eq!(p12.tile_size, 0);
        assert_eq!(p12.proc_threads, 2);
        assert_eq!(p12.thread_arg, "1:2:2");
    }

    #[test]
    fn test_is_vram_exhaustion_matches_the_real_failure_log() {
        // Verbatim from the run that froze the machine.
        let log = "[1 NVIDIA GeForce RTX 3050 6GB Laptop GPU]  queueC=2[8]\n\
                   vkAllocateMemory failed -2\n\
                   vkWaitForFences failed -4\n\
                   0.00%\n\
                   vkQueueSubmit failed -4\n";
        assert!(is_vram_exhaustion(log));

        // A healthy run must not trip it, progress lines and all.
        let healthy = "[1 NVIDIA GeForce RTX 3050 6GB Laptop GPU]  queueC=2[8]\n\
                       0.00%\n25.00%\n50.00%\n75.00%\n";
        assert!(!is_vram_exhaustion(healthy));
    }
}
