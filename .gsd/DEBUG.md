---
status: resolved
trigger: "still both are being used"
created: 2026-08-14T23:25:22+05:00
updated: 2026-08-14T23:28:45+05:00
---

# Debug Session: DUAL_GPU_WEBVIEW2_LOAD

## Symptom
User selects NVIDIA GPU, and Task Manager shows:
- **GPU 0 (NVIDIA RTX 3050)**: 100% 3D load (NCNN upscaler)
- **GPU 1 (Intel UHD Graphics)**: 73%–76% 3D load

## Root Cause
- AI computation is executing 100% on GPU 0 (NVIDIA RTX 3050).
- GPU 1 (Intel UHD Graphics) utilization is driven by the WebView2 UI rendering engine (`msedgewebview2.exe --type=gpu-process`) playing the background preview video and rendering the UI display for the laptop screen.

## Resolution
Working as intended by design. The user confirmed keeping the live video playback and aesthetic blur effects active during processing.
