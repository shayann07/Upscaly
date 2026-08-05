# Phase 4 Execution Plan: Package a Self-Contained LGPL Windows Video Runtime

> **Milestone**: `v2.0-win-gpu-reliability`
> **Phase**: Phase 4 — Package a self-contained LGPL Windows video runtime
> **Objective**: Bundle x64 LGPL FFmpeg/FFprobe binaries & sidecar DLLs, implement vendor H.264 hardware encoder search chain (`h264_nvenc` → `h264_qsv` → `h264_amf` → `h264_mf`), `-c:a copy` with AAC 192kbps fallback, and VFR detection/rejection.

---

## 1. LGPL Dependency Packaging & License Notices

### Plan
- Create `docs/THIRD_PARTY_NOTICES.md`:
  - Document pinned LGPL FFmpeg build: version, source URL, SHA-256 hash, build flags (`--enable-version3 --disable-gpl`), license text (LGPL v2.1/v3), and binary update instructions.
  - Exclude GPL-only `libx264`.
- Register FFmpeg binaries in `src-tauri/tauri.conf.json`:
  ```json
  "externalBin": [
    "binaries/realesrgan-ncnn-vulkan",
    "binaries/ffmpeg",
    "binaries/ffprobe"
  ]
  ```
- Enforce x64 Windows installer architecture; error explicitly on x86/ARM64.
- Implement `get_system_diagnostics` IPC command in `src-tauri/src/lib.rs` reporting sidecar binary locations, version checks, GPU discovery, and encoder availability.

---

## 2. Runtime Vendor H.264 Encoder Fallback Chain

### Plan
- Refactor video reassembly in `src-tauri/src/video_pipeline.rs`:
  - Test encoder availability in strict priority order:
    1. `h264_nvenc` (NVIDIA)
    2. `h264_qsv` (Intel QuickSync)
    3. `h264_amf` (AMD AMF)
    4. `h264_mf` (Windows Media Foundation)
  - Probe candidate availability by running a 1-frame test encode or testing sidecar output.
  - Fail over dynamically if candidate fails during actual video encoding.
  - Emit clear error if no hardware H.264 encoder is functional ("No supported hardware H.264 encoder available. Please update GPU drivers or install Media Foundation.").

---

## 3. Audio & Timing Policy

### Plan
- **Audio Stream Handling**:
  - Primary attempt: `-c:a copy` to preserve original bitstream.
  - If MP4 muxing rejects stream, retry with stereo AAC at 192 kbps (`-c:a aac -b:a 192k -ac 2`).
  - Pass audio handling result (`audio_copied` vs `audio_transcoded`) in job completion event.
- **Timing & VFR Processing**:
  - Use FFprobe to query `is_vfr` status and frame rate mode.
  - Detect variable frame rate (VFR); if detected, fail before frame extraction with actionable error message:
    `"Variable frame rate (VFR) videos are not supported in this release. Please convert to constant frame rate (CFR) before upscaling."`
  - Preserve original CFR frame rate and timing metadata in MP4 container.

---

## Acceptance Gate Checklist (Phase 4)
- [ ] `docs/THIRD_PARTY_NOTICES.md` created with LGPL FFmpeg attribution and build specs.
- [ ] `tauri.conf.json` registers `ffmpeg` and `ffprobe` as target-triple sidecars.
- [ ] Encoder fallback chain tests `h264_nvenc` → `h264_qsv` → `h264_amf` → `h264_mf` dynamically.
- [ ] `-c:a copy` falls back to AAC 192kbps stereo when audio copying fails.
- [ ] VFR videos are rejected before processing with explicit user-facing error message.
- [ ] `get_system_diagnostics` command returns valid diagnostic metadata.
- [ ] `cargo test` and `npm.cmd run test` pass 100%.
