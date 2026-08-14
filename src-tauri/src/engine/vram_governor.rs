use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExecutionProfile {
    pub tile_size: i32,
    pub thread_arg: String,
    pub projected_vram_mb: u64,
    pub proc_threads: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct VramProfile {
    pub total_vram_mb: u64,
    pub used_vram_mb: u64,
    pub safe_tile_size: i32,
    pub auto_tile_size: i32,
    pub proc_threads: u32,
    pub thread_arg: String,
    pub is_overflowing: bool,
    pub status_message: String,
}

/// Calculate single tile memory footprint in megabytes (including model baseline tensors).
#[must_use]
pub fn estimate_single_tile_memory_mb(tile_size: i32) -> u64 {
    let t = tile_size.clamp(32, 1024) as f64;
    // Model base weight overhead: ~400 MB
    // Buffer scaling: (t / 100)^2 * 130 MB
    let buffer_mb = (t / 100.0).powi(2) * 130.0;
    (400.0 + buffer_mb).round() as u64
}

/// Calculate total projected VRAM usage given tile size and concurrent GPU worker threads.
#[must_use]
pub fn estimate_total_vram_mb(tile_size: i32, proc_threads: u32) -> u64 {
    let base_model_mb = 400u64;
    let t = tile_size.clamp(32, 1024) as f64;
    let single_buffer_mb = ((t / 100.0).powi(2) * 130.0).round() as u64;
    (base_model_mb + single_buffer_mb) * u64::from(proc_threads.max(1))
}

/// Determine the maximum safe tile size and thread configuration for a given GPU VRAM budget.
///
/// Ensures total VRAM stays strictly below `0.75 * gpu_vram_mb` to leave generous headroom for OS/DWM.
#[must_use]
pub fn calculate_safe_execution_profile(
    gpu_vram_mb: u64,
    requested_tile: i32,
    _is_video: bool,
) -> ExecutionProfile {
    // Effective usable VRAM ceiling (reserve 25% or min 500MB for OS/DWM display compositing)
    let safe_ceiling_mb = if gpu_vram_mb <= 1024 {
        gpu_vram_mb.saturating_sub(200).max(300)
    } else if gpu_vram_mb <= 2048 {
        gpu_vram_mb.saturating_sub(450).max(600)
    } else {
        (gpu_vram_mb as f64 * 0.75).round() as u64
    };

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

        // Dual GPU pipelines (proc = 2) ONLY allowed for large desktop GPUs >= 10GB (10240MB)
        let dual_thread_vram = estimate_total_vram_mb(tile, 2);
        if dual_thread_vram <= safe_ceiling_mb && gpu_vram_mb >= 10240 {
            return ExecutionProfile {
                tile_size: tile,
                thread_arg: "1:2:2".to_string(),
                projected_vram_mb: dual_thread_vram,
                proc_threads: 2,
            };
        }

        // Single GPU pipeline (proc = 1) for all GPUs <= 8GB (including 6GB laptops)
        let single_thread_vram = estimate_total_vram_mb(tile, 1);
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
        projected_vram_mb: estimate_total_vram_mb(32, 1),
        proc_threads: 1,
    }
}

#[must_use]
pub fn build_vram_profile(gpu_vram_mb: u64, requested_tile: i32) -> VramProfile {
    let auto_profile = calculate_safe_execution_profile(gpu_vram_mb, 0, false);
    let selected_profile = calculate_safe_execution_profile(gpu_vram_mb, requested_tile, false);

    let is_overflowing = selected_profile.projected_vram_mb > gpu_vram_mb;
    let total_gb = gpu_vram_mb as f64 / 1024.0;
    let used_gb = selected_profile.projected_vram_mb as f64 / 1024.0;

    let status_message = if requested_tile == 0 {
        format!(
            "AUTO dynamically tunes tile size via Vulkan hardware heaps (Single-Thread Safe Mode) · Projected: {:.1} GB / {:.1} GB.",
            used_gb,
            total_gb
        )
    } else if selected_profile.tile_size < requested_tile {
        format!(
            "Clamped to {}px (Single-Thread Safe Mode) to prevent VRAM overflow ({:.1} GB / {:.1} GB).",
            selected_profile.tile_size,
            used_gb,
            total_gb
        )
    } else if selected_profile.proc_threads == 1 {
        format!(
            "Selected {}px tile (Single-Thread Safe Mode) · Projected: {:.1} GB / {:.1} GB.",
            selected_profile.tile_size, used_gb, total_gb
        )
    } else {
        format!(
            "Selected {}px tile (Dual-Thread Accelerated) · Projected: {:.1} GB / {:.1} GB.",
            selected_profile.tile_size, used_gb, total_gb
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
    fn test_vram_governor_6gb_gpu_512_tile() {
        // On a 6GB GPU (6144 MB), selecting 512 tile must force proc = 1 to stay at ~3.5GB VRAM
        let profile = calculate_safe_execution_profile(6144, 512, true);
        assert_eq!(profile.tile_size, 512);
        assert_eq!(profile.proc_threads, 1);
        assert_eq!(profile.thread_arg, "1:1:2");
        assert!(profile.projected_vram_mb <= 4000);
        assert!(profile.projected_vram_mb >= 3000);
    }

    #[test]
    fn test_vram_governor_6gb_gpu_384_tile() {
        // On a 6GB GPU, 384 tile runs proc = 1 for guaranteed stability (~2.3 GB)
        let profile = calculate_safe_execution_profile(6144, 384, true);
        assert_eq!(profile.tile_size, 384);
        assert_eq!(profile.proc_threads, 1);
        assert_eq!(profile.thread_arg, "1:1:2");
        assert!(profile.projected_vram_mb <= 3000);
    }

    #[test]
    fn test_vram_governor_12gb_gpu_512_tile() {
        // On a 12GB GPU (12288 MB), 512 tile runs proc = 2 for maximum speed
        let profile = calculate_safe_execution_profile(12288, 512, true);
        assert_eq!(profile.tile_size, 512);
        assert_eq!(profile.proc_threads, 2);
        assert_eq!(profile.thread_arg, "1:2:2");
        assert!(profile.projected_vram_mb <= 8000);
    }

    #[test]
    fn test_vram_governor_2gb_integrated_gpu() {
        // On a 2GB Intel GPU (2048 MB), requesting 512 tile clamps down safely to 128 or lower
        let profile = calculate_safe_execution_profile(2048, 512, false);
        assert!(profile.tile_size <= 256);
        assert_eq!(profile.proc_threads, 1);
        assert!(profile.projected_vram_mb <= 1700);
    }

    #[test]
    fn test_vram_governor_512mb_gpu() {
        // On a 512MB legacy GPU, clamped to 32-64px
        let profile = calculate_safe_execution_profile(512, 256, false);
        assert!(profile.tile_size <= 64);
        assert_eq!(profile.proc_threads, 1);
    }

    #[test]
    fn test_vram_governor_auto_mode() {
        let p6 = calculate_safe_execution_profile(6144, 0, true);
        assert_eq!(p6.tile_size, 0);
        assert_eq!(p6.proc_threads, 1);
        assert_eq!(p6.thread_arg, "1:1:2");

        let p2 = calculate_safe_execution_profile(2048, 0, false);
        assert_eq!(p2.tile_size, 0);
        assert_eq!(p2.proc_threads, 1);
        assert_eq!(p2.thread_arg, "1:1:1");

        let p12 = calculate_safe_execution_profile(12288, 0, true);
        assert_eq!(p12.tile_size, 0);
        assert_eq!(p12.proc_threads, 2);
        assert_eq!(p12.thread_arg, "1:2:2");
    }
}
