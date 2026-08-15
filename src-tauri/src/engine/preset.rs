//! Quality/Balanced/Speed presets.
//!
//! A preset is a *request*, not a decision. It proposes a tile size and asks
//! for TTA; the VRAM governor still has the final say on what actually runs,
//! and an explicit tile-size choice by the user still wins over the preset's
//! proposal. Nothing here can hand the engine a configuration the governor
//! would have rejected.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default, ts_rs::TS)]
#[ts(export, export_to = "../../src/lib/ipc/")]
#[serde(rename_all = "lowercase")]
pub enum QualityPreset {
    /// Largest tile the card will take, plus TTA. Slowest by a wide margin.
    Quality,
    #[default]
    Balanced,
    /// Delegates tiling to NCNN's heap heuristic and never pays for TTA.
    Speed,
}

/// What a preset asks the engine for.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PresetProfile {
    /// Test-time augmentation: the tile is run in eight orientations and the
    /// results averaged. Visibly cleaner edges and less directional ringing,
    /// at roughly eight times the GPU work.
    pub tta: bool,
    /// The tile this preset would like. `0` delegates to NCNN's own heap
    /// heuristic. Larger tiles mean fewer seams between tiles, which is why
    /// Quality asks for one -- but the governor will clamp it, and on a card
    /// that cannot hold 512 the clamp is the whole point.
    pub requested_tile: i32,
    /// Decode and encode threads: the first and last components of
    /// `-j load:proc:save`.
    ///
    /// These are the only knob a preset gets over throughput, and
    /// deliberately so. The middle component -- GPU worker threads -- is the
    /// one that multiplies VRAM, and it stays entirely the governor's
    /// decision; a prior commit hardened its dual-proc gate to 10GB+ cards
    /// after real stability problems on 6-8GB ones, and no preset gets to
    /// reach around that. Load and save threads are CPU-side image codec
    /// work and cost no device memory at all, so raising them is free of the
    /// failure mode this whole subsystem exists to prevent.
    pub io_threads: u32,
}

impl QualityPreset {
    #[must_use]
    pub fn profile(self) -> PresetProfile {
        match self {
            Self::Quality => PresetProfile {
                tta: true,
                requested_tile: 512,
                io_threads: 2,
            },
            Self::Balanced => PresetProfile {
                tta: false,
                requested_tile: 0,
                io_threads: 2,
            },
            Self::Speed => PresetProfile {
                tta: false,
                requested_tile: 0,
                io_threads: 4,
            },
        }
    }

    /// How many times more GPU work than a single pass, used to project a
    /// runtime before the user commits to it.
    #[must_use]
    pub fn work_multiplier(self) -> u32 {
        if self.profile().tta {
            8
        } else {
            1
        }
    }
}

/// The tile size to hand the governor, reconciling the preset's proposal with
/// an explicit user choice.
///
/// An explicit tile is a deliberate instruction and always wins; `0` means
/// AUTO, which is exactly when the preset gets to express a preference.
#[must_use]
pub fn effective_requested_tile(user_tile: i32, preset: QualityPreset) -> i32 {
    if user_tile > 0 {
        user_tile
    } else {
        preset.profile().requested_tile
    }
}

/// Rewrites the governor's `-j load:proc:save` with the preset's IO threads,
/// leaving the middle component exactly as the governor set it.
///
/// The middle number is the GPU worker count and the only one that
/// multiplies device memory. Preserving it verbatim is what makes this safe
/// to apply on top of any profile the governor returns: the preset can make
/// decode and encode wider, and cannot make the GPU side wider.
#[must_use]
pub fn apply_io_threads(thread_arg: &str, preset: QualityPreset) -> String {
    let io = preset.profile().io_threads;
    let mut parts = thread_arg.split(':');
    let (Some(_load), Some(proc), Some(_save), None) =
        (parts.next(), parts.next(), parts.next(), parts.next())
    else {
        // Not the shape we expect -- hand back what the governor produced
        // rather than assembling something from a misparse.
        return thread_arg.to_string();
    };
    format!("{io}:{proc}:{io}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_only_quality_pays_for_tta() {
        assert!(QualityPreset::Quality.profile().tta);
        assert!(!QualityPreset::Balanced.profile().tta);
        assert!(!QualityPreset::Speed.profile().tta);
        assert_eq!(QualityPreset::Quality.work_multiplier(), 8);
        assert_eq!(QualityPreset::Balanced.work_multiplier(), 1);
    }

    #[test]
    fn test_an_explicit_tile_choice_beats_the_preset() {
        // The user picked 256 deliberately; Quality asking for 512 must not
        // silently overrule that.
        assert_eq!(effective_requested_tile(256, QualityPreset::Quality), 256);
        assert_eq!(effective_requested_tile(128, QualityPreset::Speed), 128);
    }

    #[test]
    fn test_the_preset_speaks_only_for_auto() {
        assert_eq!(effective_requested_tile(0, QualityPreset::Quality), 512);
        assert_eq!(effective_requested_tile(0, QualityPreset::Balanced), 0);
        assert_eq!(effective_requested_tile(0, QualityPreset::Speed), 0);
    }

    #[test]
    fn test_speed_actually_differs_from_balanced() {
        // Both skip TTA and both delegate the tile, so if the IO threads
        // matched too the Speed button would be decorative.
        let balanced = QualityPreset::Balanced.profile();
        let speed = QualityPreset::Speed.profile();
        assert_ne!(balanced, speed);
        assert!(speed.io_threads > balanced.io_threads);
    }

    #[test]
    fn test_io_threads_never_touch_the_gpu_worker_count() {
        // The middle component is the one that multiplies VRAM. A preset
        // widening decode/encode must leave it exactly as the governor set
        // it -- including the dual-proc profile reserved for large cards.
        assert_eq!(apply_io_threads("1:1:2", QualityPreset::Speed), "4:1:4");
        assert_eq!(apply_io_threads("1:2:2", QualityPreset::Speed), "4:2:4");
        assert_eq!(apply_io_threads("1:1:1", QualityPreset::Speed), "4:1:4");
        assert_eq!(apply_io_threads("1:2:2", QualityPreset::Quality), "2:2:2");
    }

    #[test]
    fn test_io_threads_leaves_an_unexpected_thread_arg_alone() {
        // Better to run the governor's own string than to build one from a
        // parse that did not hold.
        assert_eq!(apply_io_threads("weird", QualityPreset::Speed), "weird");
        assert_eq!(apply_io_threads("1:2", QualityPreset::Speed), "1:2");
        assert_eq!(apply_io_threads("1:2:3:4", QualityPreset::Speed), "1:2:3:4");
    }

    #[test]
    fn test_balanced_is_the_default() {
        // Whatever the serde default resolves to is what a settings file
        // written before presets existed will load as, so it must be the
        // conservative middle rather than the 8x one.
        assert_eq!(QualityPreset::default(), QualityPreset::Balanced);
    }

    #[test]
    fn test_preset_survives_a_json_roundtrip() {
        for preset in [
            QualityPreset::Quality,
            QualityPreset::Balanced,
            QualityPreset::Speed,
        ] {
            let json = serde_json::to_string(&preset).unwrap();
            assert_eq!(
                serde_json::from_str::<QualityPreset>(&json).unwrap(),
                preset
            );
        }
        // The wire form the frontend sends.
        assert_eq!(
            serde_json::from_str::<QualityPreset>("\"quality\"").unwrap(),
            QualityPreset::Quality
        );
    }
}
