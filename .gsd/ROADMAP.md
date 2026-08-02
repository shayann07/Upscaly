# ROADMAP.md

> **Current Milestone**: `v1.0-liquid-glass`
> **Goal**: Full production-grade rewrite of Upscaly desktop app with Async Rust backend, Windows Job Object sidecar isolation, 60fps Liquid Dark Theme (`Cosmic`/`Violet`/`Lavender`/`Vanilla`), Atropos 3D tilt cards, Liquid Shimmer Pill CTA, 60fps Hardware Split-Comparison Slider, and Resumable Model Downloads.
> **Source of Truth**: [implementation_plan.md](file:///C:/Users/shaya/.gemini/antigravity-ide/brain/7348b482-8515-4914-bd7e-602a6042d4ae/implementation_plan.md)

## Must-Haves (45-Point Master Specification)
- [x] **Process Safety**: Windows Job Object sidecar tree auto-kill (`JobObjectSetInformation`)
- [x] **Instant Launch**: Cached Vulkan GPU discovery with 5s async timeout & driver hash validation
- [x] **Visual Theme**: 60fps Ambient Liquid Shader (`Cosmic` `#23212C` + `Violet` `#36255C` + `Lavender` `#D2C3F6`)
- [x] **Interactive Dropzone**: Atropos 3D Parallax tilt card with floating format tags (`PNG`, `JPG`, `MP4`) & ripple drop
- [x] **Primary CTA**: Liquid Shimmer Pill CTA (`Vanilla` `#F1FEC8` → `Lavender` `#D2C3F6`) with 30px magnetic cursor pull
- [x] **Hardware Slider**: 60fps clip-path Before/After comparison slider with 100%/200%/400% hardware zoom lens controls
- [x] **Video Pipeline**: 3-Phase FFmpeg video pipeline with Rust RAII temp folder cleanup
- [x] **Model Downloads**: Resumable HTTP Range downloader from GitHub Releases API with SHA256 validation
- [x] **Notifications**: Floating Liquid Toast Stack with Framer Motion spring physics & one-click auto-fix CTAs
- [x] **Audio & Settings**: Apple-like UI sound effects & persistent settings store (`app_data_dir/settings.json`)

---

## Phases

### Phase 1: Async Rust Core & Sidecar Safety
**Status**: ✅ Complete  
**Objective**: Build a non-blocking Rust backend with Windows Job Objects, typed `AppError` enum IPC serialization, 5s GPU cache timeout, pre-flight disk/resource checks, and `tracing` file logger.  
**Files**: `src-tauri/src/lib.rs`, `sidecar_manager.rs`, `job_engine.rs`, `model_manager.rs`, `video_pipeline.rs`, `settings.rs`

### Phase 2: React Liquid Glass UI Architecture
**Status**: ✅ Complete  
**Objective**: Implement modular React 19 component architecture, 60fps liquid canvas shader background, Atropos 3D tilt dropzone card, friendly model selector tabs, Liquid Shimmer CTA, and Motion Primitives spring toast notifications.  
**Files**: `src/App.tsx`, `App.css`, `components/LiquidShaderBg.tsx`, `DropZone.tsx`, `SettingsPanel.tsx`, `UpscaleButton.tsx`, `ToastContainer.tsx`

### Phase 3: Hardware Comparison Slider & Video Pipeline Integration
**Status**: ✅ Complete  
**Objective**: Build 60fps hardware-accelerated clip-path Before/After comparison slider with 100%/200%/400% zoom controls, 3-phase video frame pipeline with RAII temp folder cleanup, and native Explorer file actions.  
**Files**: `components/ComparisonSlider.tsx`, `ProgressOverlay.tsx`, `CompletionCard.tsx`, `video_pipeline.rs`

### Phase 4: Model Updates, Sound FX & Final Verification
**Status**: ✅ Complete  
**Objective**: Integrate GitHub Releases API model discovery/downloader modal, Apple-like UI sound effects, settings persistence (`settings.json`), and verify 0 warnings/errors across full production build.  
**Files**: `components/UpdateBadge.tsx`, `lib/models.ts`, `settings.rs`, full verification suite

### Phase 5: Comprehensive Automated Testing Suite
**Status**: ⬜ Not Started  
**Objective**: Implement unit tests, IPC integration tests, and UI component tests across Rust backend and React frontend.  
**Depends on**: Phase 4  
**Tasks**:
- [ ] TBD (run /plan 5 to create)
