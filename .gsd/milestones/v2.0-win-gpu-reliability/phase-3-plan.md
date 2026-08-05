# Phase 3 Execution Plan: Make GPU Discovery Truthful and Resilient

> **Milestone**: `v2.0-win-gpu-reliability`
> **Phase**: Phase 3 — Make GPU discovery truthful and resilient
> **Objective**: Parse NCNN verbose probe into structured `GpuDevice` capabilities, enforce probe timeout, maintain 24h cache with re-probe on error, eliminate fake VRAM metrics, and disable enqueueing when 0 Vulkan GPUs exist.

---

## 1. Structured Capability Reporting & Probe Parsing

### Plan
- Update `GpuDevice` struct in `src-tauri/src/sidecar_manager.rs` and `src/lib/types.ts`:
  ```rust
  #[derive(Debug, Serialize, Deserialize, Clone)]
  pub struct GpuDevice {
      pub id: i32,
      pub name: String,
      pub detail: String,
      pub fp16_storage_supported: bool,
      pub fp16_arithmetic_supported: bool,
      pub compute_queue_count: u32,
  }
  ```
- Refactor NCNN probe parser:
  - Run sidecar invalid-input probe with 5-second timeout.
  - Parse device lines `[id name]` as well as fp16 and queue capability flags.
  - Populate `detail` string summarizing capability features.
- Return explicit empty list `[]` when no Vulkan GPUs are discovered (eliminate fake "Auto GPU" ID 0 fallback).

---

## 2. 24-Hour Cache Lifecycle & Forced Re-Probe

### Plan
- Define `GpuCache` envelope struct in `src-tauri/src/sidecar_manager.rs`:
  ```rust
  #[derive(Debug, Serialize, Deserialize)]
  pub struct GpuCache {
      pub timestamp: u64,
      pub sidecar_hash: String,
      pub devices: Vec<GpuDevice>,
  }
  ```
- Check cache validity:
  - Valid if `timestamp` < 24 hours old AND `sidecar_hash` matches current binary SHA-256.
  - Re-probe immediately if cache is expired, invalid, or upon explicit frontend refresh request or GPU init error.

---

## 3. Frontend UI Enforcement & Memory Labeling

### Plan
- Refactor `src/App.tsx` and `src/components/SettingsPanel.tsx`:
  - When `gpus.length === 0`:
    - Disable upscale run button in UI.
    - Render warning toast/banner: "No Vulkan-compatible GPU detected. Please install updated display drivers."
  - Remove fake VRAM "used" values; display capability details and label any VRAM text explicitly as an estimate.
- Restrict GPU selection to a single Vulkan GPU ID (no multi-GPU comma modes).

---

## Acceptance Gate Checklist (Phase 3)
- [ ] `GpuDevice` struct exposes `fp16_storage_supported`, `fp16_arithmetic_supported`, and `compute_queue_count`.
- [ ] Probe parser returns explicit `[]` when 0 Vulkan devices are present (no fake Auto GPU ID 0).
- [ ] 24-hour disk cache operates correctly and invalidates on stale timestamp or sidecar hash change.
- [ ] UI disables upscale execution and displays driver setup guidance when `gpus.length === 0`.
- [ ] Fake VRAM "used" values removed from UI.
- [ ] `cargo test` and `npm.cmd run test` pass 100%.
