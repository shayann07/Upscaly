# ROADMAP.md

> **Current Milestone**: `Refactor Modularization Quality Gate`
> **Goal**: Execute the audit-backed modularization roadmap without changing product behavior, while driving the branch from the documented failing baseline to a clean quality gate.

## Must-Haves
- [ ] **Must-Have 1**: Zero functional or UI behavior regressions across image, video, batch upscaling, settings, and model catalog workflows.
- [ ] **Must-Have 2**: Drive aggregate quality gate from current failing baseline to 100% clean passing state (`check:ts`, `lint:ts`, `test`, `build`, `check:rust`, `format:ts:check`, `format:rust:check`).
- [ ] **Must-Have 3**: Maintain strict zero-warning policy (`--max-warnings 0` for ESLint, `-D warnings` for Cargo Clippy); thresholds must NOT be relaxed or weakened under any circumstances.
- [ ] **Must-Have 4**: Decompose monolithic frontend orchestrator (`src/App.tsx`) and large UI components into modular presentation components and custom hooks.
- [ ] **Must-Have 5**: Eliminate batch completion interval polling in favor of reducer-driven event handling with backend `output_path` treated as authoritative.
- [ ] **Must-Have 6**: Modularize backend Tauri commands (`src-tauri/src/lib.rs`), queue runtime (`job_queue.rs`), video pipeline (`video_pipeline.rs`), and model store (`model_store.rs`).

---

## Constraints
- **No immediate refactoring**: First create the milestone and task breakdown only.
- **Preserve behavior**: Maintain exact current product behavior unless a task explicitly covers a documented bug from `docs/REFACTORING_PLAN.md`.
- **Atomic commits**: Keep commits atomic by phase and task.
- **Authoritative output path**: Treat backend event `output_path` as authoritative during queue and event refactors.
- **Non-negotiable quality gate**: Tests must pass before marking any task complete. ESLint and Clippy thresholds must never be weakened.

---

## Phases

### Phase 1: Freeze Baseline and Add Non-Mutating Quality Gate Scripts
**Status**: ✅ Complete  
**Objective**: Establish non-mutating npm script checks for formatting and full quality gate verification without relaxing any lint or clippy thresholds.  

#### Tasks
- **Task 1.1: Add non-mutating format check scripts**
  - **Files**: `package.json`
  - **Acceptance Criteria**: Add `format:ts:check` (`prettier --check "src/**/*.{ts,tsx,css}"`), `format:rust:check` (`cargo fmt --manifest-path src-tauri/Cargo.toml --check`), and `check:quality` script without modifying existing lint/clippy rules or lowering thresholds.
  - **Verification Commands**: `npm.cmd run format:ts:check` (expected fail on baseline), `npm.cmd run format:rust:check` (expected fail on baseline).
  - **Rules**: Tests must pass before marking complete; lint/clippy thresholds must not be weakened.

- **Task 1.2: Record baseline audit state in documentation**
  - **Files**: `docs/REFACTORING_PLAN.md`
  - **Acceptance Criteria**: Ensure exact failing baseline metrics (15 ESLint warnings, 160 Clippy warnings, 29 unformatted TS files) are documented for regression tracking.
  - **Verification Commands**: `npm.cmd run check:ts`, `npm.cmd run test`, `npm.cmd run build`.
  - **Rules**: Tests must pass before marking complete; lint/clippy thresholds must not be weakened.

---

### Phase 2: Mechanical Formatting and Text Normalization
**Status**: ✅ Complete  
**Objective**: Execute automated formatting across frontend and Rust codebases and repair text/encoding mojibake without changing logic or behavior.  

#### Tasks
- **Task 2.1: Run mechanical formatting pass on frontend and Rust**
  - **Files**: `src/**/*.{ts,tsx,css}`, `src-tauri/src/**/*.rs`
  - **Acceptance Criteria**: Run Prettier and `cargo fmt` to clear formatting diagnostics across 29 frontend files and `src-tauri/src/lib.rs`.
  - **Verification Commands**: `npx.cmd prettier --check "src/**/*.{ts,tsx,css}"`, `cargo fmt --manifest-path src-tauri/Cargo.toml --check`.
  - **Rules**: Tests must pass before marking complete; lint/clippy thresholds must not be weakened.

- **Task 2.2: Text normalization and UTF-8 mojibake repair**
  - **Files**: User-facing UI component strings, validator scripts (`scripts/*.ps1`)
  - **Acceptance Criteria**: Repair corrupted UTF-8 mojibake symbols/glyphs in UI components and Powershell scripts without altering runtime logic.
  - **Verification Commands**: `npm.cmd run check:ts`, `npm.cmd run test`.
  - **Rules**: Tests must pass before marking complete; lint/clippy thresholds must not be weakened.

---

### Phase 3: Add Refactor Safety Tests
**Status**: ✅ Complete  
**Objective**: Build isolated unit test protection around pure job lifecycle state, output path construction, and backend event normalization before modifying application components.  

#### Tasks
- **Task 3.1: Extract and test pure job state lifecycle helpers**
  - **Files**: `src/lib/types.ts`, `src/lib/jobState.ts` (new), `src/lib/__tests__/jobState.test.ts` (new)
  - **Acceptance Criteria**: Isolate status transition validators and terminal state helpers into pure unit-tested modules. Cover valid/invalid state transitions, terminal-state idempotency, and status string normalization.
  - **Verification Commands**: `npm.cmd run test`.
  - **Rules**: Tests must pass before marking complete; lint/clippy thresholds must not be weakened.

- **Task 3.2: Extract and test output path reservation mapping**
  - **Files**: `src/lib/outputPaths.ts` (new), `src/lib/__tests__/outputPaths.test.ts` (new)
  - **Acceptance Criteria**: Add unit tests for per-job output path mapping, auto-increment scale suffixing, and directory fallback logic to protect batch execution refactoring.
  - **Verification Commands**: `npm.cmd run test`, `npm.cmd run check:ts`.
  - **Rules**: Tests must pass before marking complete; lint/clippy thresholds must not be weakened.

---

### Phase 4: Extract Frontend Settings, Model Catalog, and Media Selection Hooks
**Status**: ✅ Complete  
**Objective**: Decompose `src/App.tsx` state management by extracting settings persistence, model catalog status resolution, and media file/folder selection into focused custom hooks.  

#### Tasks
- **Task 4.1: Extract settings state hook**
  - **Files**: `src/App.tsx`, `src/hooks/useSettings.ts` (new), `src/hooks/__tests__/useSettings.test.ts` (new)
  - **Acceptance Criteria**: Encapsulate GPU selection, tile size, output path, sound muted, and VRAM tuner settings persistence into `useSettings`.
  - **Verification Commands**: `npm.cmd run check:ts`, `npm.cmd run test`, `npm.cmd run lint:ts`.
  - **Rules**: Tests must pass before marking complete; lint/clippy thresholds must not be weakened.

- **Task 4.2: Extract model catalog state hook**
  - **Files**: `src/App.tsx`, `src/hooks/useModelCatalog.ts` (new), `src/lib/models.ts`
  - **Acceptance Criteria**: Encapsulate catalog fetching, installed model state, download progress tracking, and model repair logic into `useModelCatalog`.
  - **Verification Commands**: `npm.cmd run check:ts`, `npm.cmd run test`, `npm.cmd run lint:ts`.
  - **Rules**: Tests must pass before marking complete; lint/clippy thresholds must not be weakened.

- **Task 4.3: Extract media selection state hook**
  - **Files**: `src/App.tsx`, `src/hooks/useMediaSelection.ts` (new), `src/lib/media.ts`
  - **Acceptance Criteria**: Encapsulate drag-and-drop file/folder ingestion, media dimension probing, and initial batch item creation into `useMediaSelection`.
  - **Verification Commands**: `npm.cmd run check:ts`, `npm.cmd run test`, `npm.cmd run lint:ts`, `npm.cmd run build`.
  - **Rules**: Tests must pass before marking complete; lint/clippy thresholds must not be weakened.

---

### Phase 5: Replace Batch Polling with Event-Driven Queue State
**Status**: ✅ Complete  
**Objective**: Eliminate interval polling in batch upscaling in favor of a reducer-driven queue state machine, treating backend `output_path` events as authoritative.  

#### Tasks
- **Task 5.1: Extract Tauri job event listener hook**
  - **Files**: `src/App.tsx`, `src/hooks/useJobEvents.ts` (new)
  - **Acceptance Criteria**: Encapsulate Tauri IPC event subscriptions (`job-status-changed`, `download-progress`) into a dedicated hook with strict cleanup.
  - **Verification Commands**: `npm.cmd run check:ts`, `npm.cmd run test`.
  - **Rules**: Tests must pass before marking complete; lint/clippy thresholds must not be weakened.

- **Task 5.2: Replace batch polling with reducer-driven queue state**
  - **Files**: `src/App.tsx`, `src/hooks/useUpscaleQueue.ts` (new), `src/lib/jobState.ts`, `src/components/BatchQueueView.tsx`
  - **Acceptance Criteria**: Remove `setInterval` completion polling in `handleStartBatchUpscale`. Use `useUpscaleQueue` state reducer keyed by stable `jobId`. Treat backend event `output_path` as authoritative for destination path and history updates.
  - **Verification Commands**: `npm.cmd run check:ts`, `npm.cmd run test`, `npm.cmd run lint:ts`, `npm.cmd run build`.
  - **Rules**: Tests must pass before marking complete; lint/clippy thresholds must not be weakened.

---

### Phase 6: Split Large Frontend Components
**Status**: ✅ Complete  
**Objective**: Decompose monolithic UI components to eliminate max-lines and complexity ESLint warnings while preserving identical visual appearance and user interactions.  

#### Tasks
- **Task 6.1: Refactor and split `BatchQueueView`**
  - **Files**: `src/components/BatchQueueView.tsx`, `src/components/batch/BatchQueueSummary.tsx` (new), `src/components/batch/BatchQueueRow.tsx` (new)
  - **Acceptance Criteria**: Decompose `BatchQueueView` into presentational sub-components. Bring function line count under 150 lines and cognitive complexity under 20.
  - **Verification Commands**: `npm.cmd run check:ts`, `npm.cmd run test`, `npm.cmd run lint:ts`.
  - **Rules**: Tests must pass before marking complete; lint/clippy thresholds must not be weakened.

- **Task 6.2: Refactor and split `ComparisonSlider`**
  - **Files**: `src/components/ComparisonSlider.tsx`, `src/components/comparison/ComparisonToolbar.tsx` (new), `src/components/comparison/ComparisonViewport.tsx` (new), `src/hooks/useComparisonDrag.ts` (new)
  - **Acceptance Criteria**: Extract drag/pan state and view toolbar controls. Reduce function length below 150 lines and complexity below 20.
  - **Verification Commands**: `npm.cmd run check:ts`, `npm.cmd run test`, `npm.cmd run lint:ts`.
  - **Rules**: Tests must pass before marking complete; lint/clippy thresholds must not be weakened.

- **Task 6.3: Refactor and split `Titlebar`, `SettingsPanel`, and `AdvancedSettings`**
  - **Files**: `src/components/Titlebar.tsx`, `src/components/SettingsPanel.tsx`, `src/components/AdvancedSettings.tsx`, `src/components/titlebar/*` (new)
  - **Acceptance Criteria**: Extract window controls, GPU selector, and tuner controls into focused components. Resolve all 15 ESLint max-lines and complexity warnings across frontend.
  - **Verification Commands**: `npm.cmd run check:ts`, `npm.cmd run lint:ts`, `npm.cmd run test`, `npm.cmd run build`.
  - **Rules**: Tests must pass before marking complete; lint/clippy thresholds must not be weakened.

---

### Phase 7: Modularize Rust Tauri Command Registration
**Status**: ✅ Complete  
**Objective**: Reorganize monolithic `src-tauri/src/lib.rs` by moving raw command functions into modular domain submodules while preserving exact Tauri IPC command names.  

#### Tasks
- **Task 7.1: Extract GPU and Settings commands**
  - **Files**: `src-tauri/src/lib.rs`, `src-tauri/src/commands/mod.rs` (new), `src-tauri/src/commands/gpu.rs` (new), `src-tauri/src/commands/settings.rs` (new)
  - **Acceptance Criteria**: Move GPU probing and settings persistence commands into domain modules. Maintain exact IPC command names (`get_gpus`, `list_gpus`, etc.).
  - **Verification Commands**: `cargo fmt --manifest-path src-tauri/Cargo.toml --check`, `cargo test --manifest-path src-tauri/Cargo.toml`.
  - **Rules**: Tests must pass before marking complete; lint/clippy thresholds must not be weakened.

- **Task 7.2: Extract Model, Files, and Diagnostic commands**
  - **Files**: `src-tauri/src/lib.rs`, `src-tauri/src/commands/models.rs` (new), `src-tauri/src/commands/files.rs` (new), `src-tauri/src/commands/diagnostics.rs` (new)
  - **Acceptance Criteria**: Move catalog management, file explorer launchers, and diagnostic logging commands into domain modules.
  - **Verification Commands**: `cargo fmt --manifest-path src-tauri/Cargo.toml --check`, `cargo test --manifest-path src-tauri/Cargo.toml`.
  - **Rules**: Tests must pass before marking complete; lint/clippy thresholds must not be weakened.

- **Task 7.3: Extract Upscale commands and reduce parameter count**
  - **Files**: `src-tauri/src/lib.rs`, `src-tauri/src/commands/upscale.rs` (new)
  - **Acceptance Criteria**: Move upscale invocation commands to `commands/upscale.rs`. Replace 9-argument internal `upscale_image` call with a strongly typed request struct to resolve `clippy::too_many_arguments`.
  - **Verification Commands**: `cargo fmt --manifest-path src-tauri/Cargo.toml --check`, `cargo test --manifest-path src-tauri/Cargo.toml`, `npm.cmd run check:rust`.
  - **Rules**: Tests must pass before marking complete; lint/clippy thresholds must not be weakened.

---

### Phase 8: Refactor Rust Queue Service and Output Reservation
**Status**: ✅ Complete  
**Objective**: Encapsulate global queue state into a testable `JobQueueService` struct with typed state transitions, safe error handling, and unit-tested output collision reservation.  

#### Tasks
- **Task 8.1: Implement `JobQueueService` and typed state transitions**
  - **Files**: `src-tauri/src/job_queue.rs`, `src-tauri/src/job_state.rs` (new)
  - **Acceptance Criteria**: Replace raw string status transitions with an internal `JobState` enum. Encapsulate queue, active registry, and reservation in `JobQueueService`.
  - **Verification Commands**: `cargo test --manifest-path src-tauri/Cargo.toml`.
  - **Rules**: Tests must pass before marking complete; lint/clippy thresholds must not be weakened.

- **Task 8.2: Replace lock unwraps and add queue unit tests**
  - **Files**: `src-tauri/src/job_queue.rs`, `src-tauri/src/output_paths.rs` (new)
  - **Acceptance Criteria**: Replace `mutex.lock().unwrap()` calls with fallible error propagation. Add direct unit tests for queued cancellation, active job cancellation, terminal state idempotency, and path collision reservation (`2x`, `3x`, `4x`).
  - **Verification Commands**: `cargo test --manifest-path src-tauri/Cargo.toml`, `npm.cmd run check:rust`.
  - **Rules**: Tests must pass before marking complete; lint/clippy thresholds must not be weakened.

---

### Phase 9: Decompose Video Pipeline
**Status**: ✅ Complete  
**Objective**: Refactor the monolithic 405-line `run_video_job` function into structured phase runner modules with fallible path conversion and explicit encoder fallback metadata.  

#### Tasks
- **Task 9.1: Extract `VideoJobContext` and process execution runner**
  - **Files**: `src-tauri/src/video_pipeline.rs`, `src-tauri/src/video_pipeline/context.rs` (new)
  - **Acceptance Criteria**: Create `VideoJobContext` encapsulating paths, sidecar binaries, cancellation handles, and progress channels. Replace panicking `to_str().unwrap()` conversions with fallible error handling.
  - **Verification Commands**: `cargo test --manifest-path src-tauri/Cargo.toml`.
  - **Rules**: Tests must pass before marking complete; lint/clippy thresholds must not be weakened.

- **Task 9.2: Decompose video execution phases and encoder fallback strategy**
  - **Files**: `src-tauri/src/video_pipeline.rs`, `src-tauri/src/video_pipeline/encoder.rs` (new), `src-tauri/src/process_runner.rs`
  - **Acceptance Criteria**: Separate frame extraction, frame count validation, NCNN sequence upscaling, and video reassembly into distinct functions. Implement explicit `EncoderStrategy` metadata reporting.
  - **Verification Commands**: `cargo test --manifest-path src-tauri/Cargo.toml`, `npm.cmd run check:rust`.
  - **Rules**: Tests must pass before marking complete; lint/clippy thresholds must not be weakened.

---

### Phase 10: Split/Cache Model Catalog Resolution
**Status**: ⬜ Not Started  
**Objective**: Optimize model catalog resolution by separating CDN manifest fetching from local disk scanning, caching `.param` DAG parsing, and serving unified catalog status.  

#### Tasks
- **Task 10.1: Refactor NCNN param parser pipeline and add parser unit tests**
  - **Files**: `src-tauri/src/engine/param_parser.rs`
  - **Acceptance Criteria**: Split `parse_ncnn_param` into `read_header`, `parse_layer_line`, `parse_layer_params`, and `scale_factor_for_layer`. Fix cognitive complexity (31 -> <=25) and float cast clippy warnings. Add unit tests for malformed headers, comments, supported layer types (`Interp`, `Deconv`, `PixelShuffle`), and scale math.
  - **Verification Commands**: `cargo test --manifest-path src-tauri/Cargo.toml`, `npm.cmd run check:rust`.
  - **Rules**: Tests must pass before marking complete; lint/clippy thresholds must not be weakened.

- **Task 10.2: Split catalog resolution, cache metadata, and unify catalog DTO**
  - **Files**: `src-tauri/src/engine/model_store.rs`, `src-tauri/src/engine/registry_provider.rs`, `src-tauri/src/commands/models.rs`, `src/hooks/useModelCatalog.ts`
  - **Acceptance Criteria**: Cache parsed `.param` scale results per path/mtime during catalog resolution. Return single unified catalog payload to eliminate redundant `get_model_catalog` and `list_installed_models` IPC calls.
  - **Verification Commands**: `cargo test --manifest-path src-tauri/Cargo.toml`, `npm.cmd run check:rust`, `npm.cmd run check:ts`, `npm.cmd run test`.
  - **Rules**: Tests must pass before marking complete; lint/clippy thresholds must not be weakened.

---

### Phase 11: Final Gate Closure
**Status**: ⬜ Not Started  
**Objective**: Drive all quality gate checks to a 100% clean passing state across frontend, Rust backend, formatting, and tests without relaxing any thresholds.  

#### Tasks
- **Task 11.1: Fix residual Clippy diagnostics and ESLint warnings**
  - **Files**: `src-tauri/src/**/*.rs`, `src/**/*.{ts,tsx}`
  - **Acceptance Criteria**: Clear all remaining Clippy warnings (`uninlined_format_args`, `unwrap_used`, `map_unwrap_or`, `needless_borrows_for_generic_args`) and ESLint warnings under strict zero-warning rules.
  - **Verification Commands**: `npm.cmd run check:rust`, `npm.cmd run lint:ts`.
  - **Rules**: Tests must pass before marking complete; lint/clippy thresholds must not be weakened.

- **Task 11.2: Execute full quality gate suite and document final verification**
  - **Files**: `docs/REFACTORING_PLAN.md`, `.gsd/STATE.md`
  - **Acceptance Criteria**: Run full aggregate quality check gate (`check:ts`, `lint:ts`, `test`, `build`, `check:rust`, `format:ts:check`, `format:rust:check`). Update documentation with 100% clean passing baseline.
  - **Verification Commands**:
    ```powershell
    npm.cmd run check:ts
    npm.cmd run lint:ts
    npm.cmd run test
    npm.cmd run build
    cargo test --manifest-path src-tauri/Cargo.toml
    npm.cmd run check:rust
    npx.cmd prettier --check "src/**/*.{ts,tsx,css}"
    cargo fmt --manifest-path src-tauri/Cargo.toml --check
    ```
  - **Rules**: Tests must pass before marking complete; lint/clippy thresholds must not be weakened.
