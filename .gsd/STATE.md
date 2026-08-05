# GSD Application State

> **Project**: Upscaly
> **Status**: Phase 4 Planned ⬜

## Current Position
- **Milestone**: `v2.0-win-gpu-reliability`
- **Phase**: Phase 4: Package a Self-Contained LGPL Windows Video Runtime
- **Status**: Phase 4 planned and ready for execution

## Last Session Summary
Defined Phase 4 execution plan in `.gsd/phases/phase-4-plan.md`.
- **LGPL Compliance & Sidecars**: `docs/THIRD_PARTY_NOTICES.md` attribution, registering `ffmpeg` and `ffprobe` sidecars in `tauri.conf.json`, `get_system_diagnostics` IPC command.
- **Encoder Fallback Chain**: Runtime hardware search order (`h264_nvenc` → `h264_qsv` → `h264_amf` → `h264_mf`).
- **Audio Policy**: `-c:a copy` with AAC 192kbps stereo fallback.
- **Timing & VFR**: FFprobe CFR validation; explicit user error rejection for VFR inputs.

## Next Steps
- Run `/execute 4` to execute Phase 4 tasks.
