//! How much device memory the engine may plan against.
//!
//! Desktop reads a discrete GPU's `DEVICE_LOCAL` heap. Mobile cannot: on a
//! unified-memory GPU every heap is `DEVICE_LOCAL` and reports the whole
//! system's RAM, so a Vulkan-derived figure over-budgets by roughly an
//! order of magnitude and the OOM killer collects the process.

pub trait MemoryBudget: Send + Sync {
    /// Bytes the engine may plan to use, in MB.
    fn budget_mb(&self) -> u64;
    /// Tile sizes this platform will choose from, ascending.
    fn tile_candidates(&self) -> &'static [i32];
    /// Processing threads. Each duplicates the full compute buffer.
    fn max_proc_threads(&self) -> u32;
}

pub struct DesktopVram {
    pub total_vram_mb: u64,
}

impl MemoryBudget for DesktopVram {
    fn budget_mb(&self) -> u64 {
        crate::engine::vram_governor::safe_vram_ceiling_mb(self.total_vram_mb)
    }

    fn tile_candidates(&self) -> &'static [i32] {
        &[64, 128, 192, 256, 320, 384, 512]
    }

    fn max_proc_threads(&self) -> u32 {
        4
    }
}
