# ROADMAP.md

> **Current Milestone**: `v2.0-win-gpu-reliability`
> **Goal**: Refactor Upscaly around a reliable, event-driven job runtime while preserving the current inference contract, shipping a self-contained x64 LGPL FFmpeg video engine with vendor H.264 encoders, truthful Vulkan GPU discovery, output-preserving workload optimizations, and an empirical regression/benchmark test suite.

## Must-Haves
- [x] **Section 1: Establish Regression & Benchmark Evidence First**: Reference corpus, manifest with decoded RGBA image pixel hashes & video frame/stream checks, `npm.cmd run benchmark` Node runner, mockable process-runner abstraction (`ProcessRunner` trait), and repaired Vitest suite.
- [x] **Section 2: Replace Queue with Cancellable Race-Free Job Runtime**: Client-generated `job_id` (`crypto.randomUUID()`), strict terminal event contract (`queued | running | succeeded | failed | cancelled`), `VecDeque` + `ActiveJobRegistry`, non-hanging video monitor cleanup, backend output-path reservation, and React job reducer.
- [x] **Section 3: Make GPU Discovery Truthful & Resilient**: Parse NCNN verbose probe into structured `GpuDevice` capabilities (`fp16_storage`, `fp16_arithmetic`, `compute_queue_count`), 24h cache with forced re-probe on error, explicit empty list when 0 Vulkan GPUs found, disable UI enqueueing when unsupported, and single Vulkan GPU selection.
- [x] **Section 4: Package Self-Contained LGPL Windows Video Runtime**: Pinned x64 LGPL FFmpeg/FFprobe binaries + DLL sidecars, third-party notices, vendor H.264 encoder fallback chain (`h264_nvenc` -> `h264_qsv` -> `h264_amf` -> `h264_mf`), `-c:a copy` with AAC 192kbps fallback, and CFR verification / VFR rejection.
- [ ] **Section 5: Apply Only Output-Preserving GPU Optimizations**: Invariant model/scale/TTA (`-x`), dynamic thread workload profiles (`<=4MP`: `4:4:4`, `>=12MP` img / `>=8MP` vid: `2:2:2`, others: default `1:2:2`), tile default `-t 0`, accurate `-x` TTA documentation, and optional batch image directory grouping.
- [ ] **Section 6: Final Verification & Release Criteria**: Comprehensive test matrix execution (image, batch, video, GPU, x64 MSI installer), pixel output equivalence verification, zero hanging jobs, and updated user support documentation.

---

## Phases

### Phase 1: Establish Regression and Benchmark Evidence First
**Status**: ✅ Complete  
**Objective**: Build reference test corpus, `npm.cmd run benchmark` Node runner, pixel-decoded RGBA hashing, process-runner abstraction with mock support, and repair frontend Vitest suite.  
**Files**: `scripts/benchmark.ts`, `src-tauri/src/process_runner.rs`, `src/components/__tests__/*`, `package.json`, `tests/fixtures/corpus_manifest.json`

### Phase 2: Replace the Queue with a Cancellable, Race-Free Job Runtime
**Status**: ✅ Complete  
**Objective**: Implement client-generated `job_id`, strict terminal event contract (`queued | running | succeeded | failed | cancelled`), `VecDeque` + `ActiveJobRegistry`, non-hanging video monitor cleanup, backend output path reservation, and React job reducer.  
**Files**: `src-tauri/src/job_queue.rs`, `src-tauri/src/lib.rs`, `src-tauri/src/video_pipeline.rs`, `src/App.tsx`, `src/lib/types.ts`

### Phase 3: Make GPU Discovery Truthful and Resilient
**Status**: ✅ Complete  
**Objective**: Parse NCNN verbose probe into structured `GpuDevice` capabilities, enforce probe timeout, maintain 24h cache with re-probe on error, eliminate fake VRAM metrics, and disable enqueueing when 0 Vulkan GPUs exist.  
**Files**: `src-tauri/src/sidecar_manager.rs`, `src/components/SettingsPanel.tsx`, `src/lib/types.ts`

### Phase 4: Package a Self-Contained LGPL Windows Video Runtime
**Status**: ✅ Complete  
**Objective**: Bundle x64 LGPL FFmpeg/FFprobe binaries & sidecar DLLs, implement vendor H.264 hardware encoder search chain (`h264_nvenc` → `h264_qsv` → `h264_amf` → `h264_mf`), `-c:a copy` with AAC 192kbps fallback, and VFR detection/rejection.  
**Files**: `docs/THIRD_PARTY_NOTICES.md`, `src-tauri/tauri.conf.json`, `src-tauri/src/video_pipeline.rs`, `src-tauri/src/lib.rs`

### Phase 5: Apply Only Output-Preserving GPU Optimizations
**Status**: ⬜ Not Started  
**Objective**: Implement dynamic thread profile selection (`4:4:4`, `2:2:2`, `1:2:2`), set tile default to `-t 0`, update `-x` TTA docs/UI, and add optional directory batch image grouping.  
**Files**: `src-tauri/src/job_queue.rs`, `src-tauri/src/sidecar_manager.rs`, `src/components/AdvancedSettings.tsx`

### Phase 6: Final Verification and Release Criteria
**Status**: ⬜ Not Started  
**Objective**: Run complete test matrix across all image, batch, video, GPU, and installer build scenarios, validating output pixel equivalence and benchmark stability.  
**Files**: Full test suite, installer target validation, release documentation
