# TODO.md — Active Task Backlog

> **Project**: Upscaly v1.0

## Phase 1: Async Rust Core & Sidecar Safety
- [ ] Implement typed `AppError` enum using `thiserror` in `src-tauri/src/lib.rs`
- [ ] Implement `probe_gpus` with 5s timeout & `gpu_cache.json` persistence in `sidecar_manager.rs`
- [ ] Attach Windows Job Object to sidecar spawn commands for process auto-kill
- [ ] Implement `video_pipeline.rs` with RAII temp folder cleanup
- [ ] Add pre-flight storage & VRAM resource checks

## Phase 2: React Liquid Glass UI Architecture
- [ ] Setup `LiquidShaderBg.tsx` 60fps ambient background canvas
- [ ] Build custom frameless `Titlebar.tsx` with drag handle & window control pills
- [ ] Build Atropos 3D tilt `DropZone.tsx` with floating file type tags & ripple animation
- [ ] Build `SettingsPanel.tsx` with friendly model tabs & scale buttons (`2x`/`3x`/`4x`)
- [ ] Build `UpscaleButton.tsx` Liquid Shimmer Pill CTA with magnetic cursor pull

## Phase 3: Hardware Comparison Slider & Video Pipeline Integration
- [ ] Build `ComparisonSlider.tsx` with 60fps clip-path dragging & 100%/200%/400% zoom controls
- [ ] Implement 3-phase progress overlay (`Extracting` → `Upscaling` → `Reassembling`)

## Phase 4: Model Updates, Sound FX & Final Verification
- [ ] Integrate GitHub Releases API model discovery & resumable downloader
- [ ] Add Apple-like UI sound effects & settings persistence
- [ ] Run `cargo check` and `npm run build` verification
