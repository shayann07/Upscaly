# GSD Project State

> Vulkan Physical Device Mapping & Discrete GPU Auto-Prioritization verified on 2026-08-14

## Current Status
- **Project**: `Upscaly` (Desktop AI Image & Video Upscaler)
- **Status**: Discrete GPU auto-prioritization, device mapping, and telemetry verified.

## Last Session Summary
1. **Root Cause of 76% Intel GPU & 0.1 FPS Rate**:
   - Vulkan physical device probe returns:
     - `[0 Intel(R) UHD Graphics]`
     - `[1 NVIDIA GeForce RTX 3050 6GB Laptop GPU]`
   - The app previously initialized `selectedGpu` with index `0` (which bound to Intel Integrated Graphics instead of NVIDIA RTX 3050).
   - NCNN ran on the low-power Intel iGPU with `-g 0`, causing 76% Intel GPU load and 0.1 FPS.
2. **Fixes Applied**:
   - `get_gpu_list` in `sidecar_manager.rs` detects discrete GPUs (NVIDIA/AMD) and sorts them to the top of the list.
   - `useSettings.ts` defaults to the high-performance discrete GPU (`selectedGpu: 1`).
   - Clean multi-threaded CPU extraction (`-threads 0`) + Dedicated NVIDIA NCNN AI Upscaling (`-g 1`) + NVENC Reassembly (`h264_nvenc`).
3. **Verification**:
   - 17/17 Rust tests passed.
   - 42/42 Frontend tests passed.
   - 0 Clippy warnings.
   - Clean formatting across TS and Rust.

## Architecture & Planning Documents
- [SPEC.md](file:///d:/Work/Extras/image%20upscaler/.gsd/SPEC.md)
- [ROADMAP.md](file:///d:/Work/Extras/image%20upscaler/.gsd/ROADMAP.md)
- [ARCHITECTURE.md](file:///d:/Work/Extras/image%20upscaler/.gsd/ARCHITECTURE.md)
- [STACK.md](file:///d:/Work/Extras/image%20upscaler/.gsd/STACK.md)
- [STATE.md](file:///d:/Work/Extras/image%20upscaler/.gsd/STATE.md)
