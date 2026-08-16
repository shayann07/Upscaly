---
phase: 4
level: 2
researched_at: 2026-08-03
---

# Phase 4 Research: Model Updates, Sound FX & Final Verification

## Questions Investigated

1. **GitHub Releases Model Update Discovery**: How to query `https://api.github.com/repos/xinntao/Real-ESRGAN/releases/latest` from the Rust backend and trigger an `Updates Available` indicator badge in the frontend?
2. **Resumable Download Modal & SHA-256 Validation**: How to construct the model download progress modal with atomic `.param`/`.bin` SHA-256 verification before installing into `app_data_dir/models/`?
3. **Web Audio API UI Sound Synthesis**: How to synthesize subtle Apple-grade UI sound effects (drop chime, soft completion pop, error tone) natively using `AudioContext` without bundling heavy `.mp3` audio files?
4. **Settings Store Persistence**: How to persist user preferences (GPU choice, default model, scale factor 2x/3x/4x, tile size, custom output folder, sound mute toggle) in `app_data_dir/settings.json`?

---

## Findings

### 1. GitHub Releases API Query
- **Endpoint**: `https://api.github.com/repos/xinntao/Real-ESRGAN/releases/latest`
- **Rust Command**: `check_model_updates` uses `reqwest` with user-agent `Upscaly/1.0`.
- **Parsing**: Parses release tag (e.g. `v0.3.0`) and asset download URLs. Compares tag against local `app_data_dir/models/version.json`. If newer, emits `model-updates-available` IPC event.

### 2. Native Web Audio API Sound Effects
- **Zero Asset Strategy**: Synthesize soft organic tones dynamically using Web Audio API (`AudioContext`, `OscillatorNode`, `GainNode`).
- **File Drop Chime**: Sine wave dual-frequency chord (523Hz → 659Hz) with exponential decay (150ms).
- **Completion Pop**: Short soft bell (880Hz → 1760Hz) with 250ms decay.
- **Error Tone**: Low soft harmonic duo (220Hz + 233Hz) with 200ms decay.
- **Mute Preference**: Controlled by global `isMuted` boolean stored in `settings.json`.

### 3. Persistent Settings Store (`settings.rs`)
- **Location**: `app_data_dir/settings.json`
- **Structure**:
  ```json
  {
    "default_gpu_id": 0,
    "default_scale": 4,
    "default_tile_size": 0,
    "output_directory": null,
    "sound_muted": false,
    "auto_check_updates": true
  }
  ```
- **Lifecycle**: Loaded automatically during Rust setup hook; saved whenever a setting changes.

---

## Decisions Made

| Feature | Technical Approach | Rationale |
|---------|--------------------|-----------|
| GitHub Updates | Rust `reqwest` query + version comparison | No custom server infrastructure needed; uses official Real-ESRGAN releases. |
| Sound Synthesis | Native `AudioContext` synthesis | 0 extra bundle size, immediate playback, no missing asset audio errors. |
| Settings Store | Serde JSON file (`settings.json`) | Lightweight, human-readable, persists across app restarts. |

---

## Ready for Planning
- [x] GitHub Releases API parsing established
- [x] Web Audio API synthesis patterns verified
- [x] Settings JSON persistence mapped
- [x] Full verification criteria defined
