# ROADMAP.md

> **Current Milestone**: `v2.0-win-gpu-reliability`
> **Goal**: Refactor Upscaly around a reliable, event-driven job runtime, self-contained LGPL FFmpeg distribution with vendor H.264 hardware encoders, truthful GPU discovery, output-preserving GPU optimizations, and a comprehensive test/benchmark suite.

## Must-Haves
- [ ] **Regression Corpus & Benchmark Runner**: Test corpus, `npm run benchmark` CLI runner emitting JSON reports, decoded pixel RGBA hashing for images and frame/stream validation for videos.
- [ ] **Process Runner Abstraction & Test Suite**: Mockable process runner for unit tests without GPU requirements; repaired & expanded frontend vitest suite covering job state lifecycle.
- [ ] **Cancellable Event-Driven Job Runtime**: Client-generated `job_id` (`crypto.randomUUID()`), terminal job events (`queued`, `running`, `succeeded`, `failed`, `cancelled`), `VecDeque` + `ActiveJobRegistry`, safe video monitor cleanup, backend output-path reservation, and React job-state reducer.
- [ ] **Truthful GPU Discovery**: Structured `GpuDevice` capabilities parsed from NCNN probe, 24h cache with forced re-probe on error, explicit empty list fallback when no Vulkan device is found, and single-GPU selection.
- [ ] **Self-Contained LGPL Video Engine**: Bundled x64 LGPL FFmpeg/FFprobe binaries + DLL sidecars, vendor H.264 hardware encoder search chain (`h264_nvenc` -> `h264_qsv` -> `h264_amf` -> `h264_mf`), `-c:a copy` with AAC fallback, and VFR detection/rejection.
- [ ] **Output-Preserving Optimizations**: Workload-based thread profiles (`4:4:4`, `2:2:2`, `1:2:2`), automatic tile `-t 0` default, accurate `-x` TTA documentation, and optional batch image grouping.
- [ ] **End-to-End Release Verification**: Full verification matrix (image, batch, video, GPU, x64 installer) passing all automated tests and benchmark regression checks.

---

## Phases

### Phase 1: Regression Corpus, Benchmark Runner & Test Infrastructure
**Status**: ⬜ Not Started  
**Objective**: Build a redistributable reference test corpus, `npm run benchmark` runner, pixel-decoded RGBA hashing, process-runner abstraction with fake sidecar support, and repair frontend vitest tests.  
**Files**: `scripts/benchmark.ts`, `src-tauri/src/process_runner.rs`, `src/components/__tests__/*`, `package.json`

### Phase 2: Cancellable Event-Driven Job Runtime & Backend Scheduler
**Status**: ⬜ Not Started  
**Objective**: Implement client-generated `job_id`, strict terminal event states, `VecDeque` job queue with `ActiveJobRegistry`, atomic cancellation, non-hanging video monitor cleanup, backend output-path reservation, and React job reducer.  
**Files**: `src-tauri/src/job_queue.rs`, `src-tauri/src/lib.rs`, `src-tauri/src/video_pipeline.rs`, `src/App.tsx`, `src/lib/types.ts`

### Phase 3: Truthful GPU Discovery & Capability Profiling
**Status**: ⬜ Not Started  
**Objective**: Parse verbose NCNN probe output into `GpuDevice` structs, handle probe execution timeouts, maintain 24h cache with re-probe on error, eliminate fake VRAM metrics, and handle no-Vulkan-GPU state gracefully.  
**Files**: `src-tauri/src/sidecar_manager.rs`, `src/components/SettingsPanel.tsx`, `src/lib/types.ts`

### Phase 4: Self-Contained LGPL Video Engine & Vendor H.264 Encoders
**Status**: ⬜ Not Started  
**Objective**: Package LGPL FFmpeg/FFprobe binaries & sidecar DLLs, implement H.264 encoder fallback chain (`h264_nvenc` -> `h264_qsv` -> `h264_amf` -> `h264_mf`), handle audio copy/AAC fallback, and reject VFR videos with explicit errors.  
**Files**: `src-tauri/src/video_pipeline.rs`, `src-tauri/tauri.conf.json`, `docs/THIRD_PARTY_NOTICES.md`

### Phase 5: Output-Preserving GPU Optimizations & Workload Profiles
**Status**: ⬜ Not Started  
**Objective**: Implement dynamic thread profile selection (`4:4:4`, `2:2:2`, `1:2:2`), set tile default to `-t 0`, update `-x` TTA docs/UI, and add optional directory batch image grouping.  
**Files**: `src-tauri/src/job_queue.rs`, `src-tauri/src/sidecar_manager.rs`, `src/components/AdvancedSettings.tsx`

### Phase 6: Comprehensive Verification & Packaging Suite
**Status**: ⬜ Not Started  
**Objective**: Run complete test matrix across all image, batch, video, GPU, and installer build scenarios, validating output pixel equivalence and benchmark stability.  
**Files**: Full test suite, installer target validation, release documentation
