# Phase 5 Execution Plan: Apply Only Output-Preserving GPU Optimizations

> **Milestone**: `v2.0-win-gpu-reliability`
> **Phase**: Phase 5 — Apply only output-preserving GPU optimizations
> **Objective**: Implement dynamic NCNN workload thread profiling (`load:proc:save`), clamp custom tile sizes, accurately document TTA (`-x`), and preserve pixel-identical inference output across image/video jobs.

---

## 1. Invariant Model, Scale, and TTA Policy

### Plan
- Keep model selection, scale factor, and TTA (`-x`) flag strictly invariant across job execution.
- Update UI labels and tooltips in `src/components/SettingsPanel.tsx`:
  - Clarify that `-x` is Real-ESRGAN NCNN Vulkan's Test-Time Augmentation (TTA) flag, performing 8x multi-pass augmentation for enhanced quality.
  - Do not introduce lossy downscaling, silent model swaps, or color conversions.

---

## 2. Dynamic Workload Thread Profiling & Tile Clamping

### Plan
- Implement `compute_workload_threads` helper in `src-tauri/src/job_queue.rs`:
  - Small images (`<= 4 MP`): `-j 4:4:4`
  - High-res images (`>= 12 MP`) & video jobs (`is_video == true` or `>= 8 MP` frames): `-j 2:2:2`
  - Standard/Intermediate workloads: default `-j 1:2:2`
- Tile size configuration:
  - Default to `-t 0` (auto-tiling).
  - Clamp user-selected custom non-zero tile sizes to valid multiples of 32 between 32 and 1024 (`((val / 32) * 32).clamp(32, 1024)`).

---

## 3. Batch Image Directory Ingestion & Collision Safety

### Plan
- Support optional batch directory intake in React frontend (`src/App.tsx`).
- Ensure output files created in batch mode use `reserve_output_path` to avoid filename collision.

---

## Acceptance Gate Checklist (Phase 5)
- [ ] `compute_workload_threads` applies `4:4:4` for <=4MP, `2:2:2` for >=12MP / video, `1:2:2` for others.
- [ ] Default tile size is `0` (auto); custom non-zero values clamped to 32-1024 multiples of 32.
- [ ] TTA (`-x`) is accurately labeled as Test-Time Augmentation in UI docs.
- [ ] `cargo test` and `npm.cmd run test` pass 100%.
- [ ] `npm.cmd run benchmark` shows pixel-hash parity with baseline manifest.
