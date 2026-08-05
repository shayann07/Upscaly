# Phase 1 Execution Plan: Establish Regression and Benchmark Evidence First

> **Milestone**: `v2.0-win-gpu-reliability`
> **Phase**: Phase 1 — Establish regression and benchmark evidence first
> **Objective**: Build a redistributable reference test corpus, `npm.cmd run benchmark` Node benchmark runner with decoded pixel RGBA hashing, Rust `ProcessRunner` trait abstraction with mock sidecar support, and repaired/expanded frontend Vitest job-state suite.

---

## 1. Reference Corpus & Acceptance Manifests

### Plan
- Create `tests/fixtures/corpus/`:
  - **Images**: 1080p, ~12 MP, ~24 MP inputs in JPEG, PNG with alpha, and WebP formats.
  - **Videos**: 1080p30 and 4K30 H.264/H.265 MP4 samples (one with audio, one without audio).
- Create baseline tracked manifest `tests/fixtures/corpus_manifest.json`:
  - Store expected model, scale, TTA setting, output dimensions, decoded RGBA pixel hashes for images, sampled frame hashes + stream metadata for videos, and audio stream presence.
- **Decoded Pixel Hashing**:
  - Decode image output via FFmpeg to raw RGBA stream prior to computing SHA-256 hash.
  - Decode video sampled frames to RGBA stream + validate stream metadata with FFprobe.
  - Preserve actual PNG/MP4 output files on hash mismatch for visual manual review.

---

## 2. Node-Based Benchmark Runner (`npm.cmd run benchmark`)

### Plan
- Create `scripts/benchmark.ts` and add `"benchmark": "tsx scripts/benchmark.ts"` to `package.json`.
- Execute packaged sidecar command path (`src-tauri/bin/...` or resolved sidecar).
- Collect & record metrics:
  - Device GPU fingerprint & driver details
  - Sidecar binary version/SHA-256 hash
  - Execution command flags (`-i`, `-o`, `-m`, `-s`, `-x`, `-j`, `-t`)
  - Elapsed time, throughput (MP/s or FPS), peak working-set proxy, disk usage
  - Output pixel hash and metadata verification against baseline manifest
- Emit JSON reports to `benchmark-reports/` (git-ignored), committing baseline expectations to source control.
- Run independently per discovered GPU (establishing RTX 3050 and Intel UHD initial reference profiles).

---

## 3. Rust ProcessRunner Abstraction & Mock Infrastructure

### Plan
- Create `src-tauri/src/process_runner.rs`:
  - Define `ProcessRunner` trait with methods: `spawn`, `poll_completion`, `cancel`, `drain_output`.
  - Implement `StdProcessRunner`: Wraps `std::process::Command` and `std::process::Child`.
  - Implement `MockProcessRunner`: Simulates progress lines, successful exit, non-zero error exit, delayed startup, cancellation, and process failure without GPU hardware.
  - Provide opt-in real Vulkan sidecar smoke test runner when compatible GPU is present.
- Refactor `job_queue.rs` and `sidecar_manager.rs` to use `ProcessRunner`.
- Add Rust unit tests in `src-tauri/src/process_runner.rs` proving mock child execution and cancellation.

---

## 4. Repair & Expand Frontend Vitest Test Suite

### Plan
- Fix broken assertions in `src/components/__tests__/SettingsPanel.test.tsx`:
  - Update text matchers from `Photos` → `Photo`, `Anime & Art` → `Anime`, `/2x/` → `/2×/` to match actual React 19 UI labels.
- Audit and repair all test files in `src/components/__tests__/`.
- Add new test file `src/components/__tests__/JobStateLifecycle.test.tsx`:
  - Test job reducer transitions (`ready` → `queued` → `running` → `succeeded` / `failed` / `cancelled`).
  - Verify terminal states never transition back to `running` or `queued`.

---

## Acceptance Gate Checklist (Phase 1)
- [ ] Reference corpus and `corpus_manifest.json` committed.
- [ ] `npm.cmd run benchmark` runs and produces valid JSON report against reference profiles.
- [ ] Decoded RGBA pixel hashing works accurately for images and sampled video frames.
- [ ] Rust `ProcessRunner` trait implemented with 100% passing unit tests using `MockProcessRunner`.
- [ ] `npm.cmd run test` passes cleanly across all frontend component & job-state tests.
- [ ] `cargo test` passes cleanly with process runner mock tests.
