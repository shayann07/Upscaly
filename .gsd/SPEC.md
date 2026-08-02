# SPEC.md — Project Specification

> **Status**: `FINALIZED`

## Vision
**Upscaly** is a state-of-the-art native desktop application for high-resolution AI image and video upscaling. Built with Tauri v2, Rust async core (Tokio), and React 19, it delivers an Apple-grade Liquid Glass UI experience with 60fps hardware-accelerated animations, Atropos 3D parallax interactions, zero-block GPU processing, and robust sidecar process safety.

## Goals
1. **Ultra-Fast Non-Blocking Upscaling**: Run Real-ESRGAN Vulkan GPU sidecar processes asynchronously under Windows Job Objects with zero UI freeze and instant GPU discovery caching.
2. **Apple-Grade Liquid Glass Aesthetic**: Deliver a 60fps mouse-reactive ambient canvas shader background (`Cosmic` `#23212C` + `Violet` `#36255C` + `Lavender` `#D2C3F6`), Atropos 3D tilt dropzone cards, and Liquid Shimmer Pill CTAs.
3. **End-to-End Image & Video Pipeline**: Provide single-pass image upscaling (2x/3x/4x) and a 3-phase video upscaling pipeline (FFmpeg demuxing → frame batching → audio/metadata remuxing).
4. **Interactive Hardware Inspection**: Hardware-accelerated 60fps Before/After Liquid Glass Split Slider with 100%/200%/400% zoom lens controls.
5. **Zero-Fluff Robustness**: Resumable GitHub Releases model downloader, typed `AppError` IPC serialization, pre-flight disk/resource checks, and structured logging.

## Non-Goals (Out of Scope)
- Cloud server rendering (all processing runs 100% locally on user GPU)
- Multi-file batch queueing in v1.0 (single-file workflow focus)
- macOS / Linux builds in v1.0 (Windows-first optimization)

## Users
Content creators, digital artists, photographers, and casual users who want an intuitive, fast, and beautiful local tool to upscale images and videos to 4K/8K without technical friction.

## Constraints
- **Target OS**: Windows 10 / 11 (64-bit)
- **GPU Runtime**: Vulkan API-capable GPU (NVIDIA / AMD / Intel)
- **Sidecar Dependencies**: `realesrgan-ncnn-vulkan.exe`, `ffmpeg.exe`

## Success Criteria
- [ ] App launches instantly with cached GPU discovery (<500ms)
- [ ] 0 zombie processes on force-close or crash (enforced via Windows Job Objects)
- [ ] Liquid Glass UI renders continuously at 60fps with 0 UI thread lag
- [ ] Image & Video upscaling completes cleanly with auto-increment file collision protection
- [ ] Split-comparison slider displays upscaled results with hardware zoom & pan
