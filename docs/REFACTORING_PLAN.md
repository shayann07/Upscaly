# Refactoring Plan

Generated: 2026-08-09  
Branch audited: `refactor/modularization`  
Scope: audit and planning only. No production code was refactored in this session.

## Baseline Report

### Quality Gate Summary

| Gate | Command | Result | Notes |
| --- | --- | --- | --- |
| Branch check | `git branch --show-current` | Passed | Current branch is `refactor/modularization`. |
| PowerShell npm shim | `npm run check:all` | Failed before project gates | Local execution policy blocks `C:\Program Files\nodejs\npm.ps1`. Use `npm.cmd` on this machine. |
| Aggregate JS/Rust gate | `npm.cmd run check:all` | Failed | `check:ts` passed, then `lint:ts` failed because ESLint warnings exceed `--max-warnings 0`; test and Rust gates did not run inside this aggregate command. |
| TypeScript type check | `npm.cmd run check:ts` via aggregate | Passed | `tsc --noEmit` completed before lint ran. |
| Frontend lint | `npm.cmd run lint:ts` via aggregate | Failed | 15 warnings, 0 errors. Warnings are treated as failures. |
| Frontend tests | `npm.cmd run test` | Passed | Vitest: 5 test files, 10 tests passed. |
| Frontend build | `npm.cmd run build` | Passed | `tsc && vite build`; 453 modules transformed; production assets emitted to `dist`. |
| Rust tests | `cargo test --manifest-path src-tauri/Cargo.toml` | Passed with warnings | 12 Rust tests passed. 5 duplicate warnings about unused/dead code. |
| Rust clippy | `npm.cmd run check:rust` | Failed | `cargo clippy -- -D warnings` reported 160 clippy/rust warnings as errors. |
| Frontend format check | `npx.cmd prettier --check "src/**/*.{ts,tsx,css}"` | Failed | 29 source/test/style files need Prettier formatting. |
| Rust format check | `cargo fmt --manifest-path src-tauri/Cargo.toml --check` | Failed | One formatting diff in `src-tauri/src/lib.rs` imports. |
| GSD validators | `powershell -ExecutionPolicy Bypass -File scripts\validate-all.ps1` | Reported passed | Console output is mojibake, matching existing encoding damage in scripts; not a product runtime gate. |

### Current Frontend Lint Warnings

ESLint fails only because warning count is capped at zero.

| File | Warning summary |
| --- | --- |
| `src/App.tsx` | `App` has 953 function lines and complexity 37; two inner arrow functions have complexity 22 and 34. |
| `src/components/AdvancedSettings.tsx` | Component has 182 function lines and complexity 21. |
| `src/components/BatchQueueView.tsx` | Component has 264 function lines and complexity 42; row render arrow has complexity 49. |
| `src/components/ComparisonSlider.tsx` | Component has 294 function lines and complexity 24. |
| `src/components/SettingsPanel.tsx` | Component has 159 function lines and complexity 41. |
| `src/components/Titlebar.tsx` | Component has 216 function lines and complexity 51. |

### Current Rust Clippy Failure Categories

`cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings` fails with 160 reported diagnostics. The highest-volume categories are:

| Count | Category |
| ---: | --- |
| 46 | Variables can be used directly in `format!` strings. |
| 23 | `unwrap()` on `Result` values. |
| 7 | Long literals lacking separators. |
| 6 | `unwrap()` on `Option` values. |
| 5 | Needless borrows for generic args. |
| 4 | Potential precision loss from `usize` to `f64`. |
| 4 | Simplifiable `map_or`. |
| 4 | Arguments passed by value but not consumed. |
| 4 | `map(...).unwrap_or_else(...)` on `Result`. |
| 3 | Missing backticks in documentation items. |
| 3 | Manual inclusive range checks. |
| 3 | Manual `let...else` candidates. |

Notable structural clippy failures:

- `src-tauri/src/video_pipeline.rs`: one function has 405 lines.
- `src-tauri/src/engine/param_parser.rs`: `parse_ncnn_param` has cognitive complexity 31/25 and 114/100 lines.
- `src-tauri/src/lib.rs`: `upscale_image` has 9 arguments; `FullModelInfo` has more than 3 bools.
- `src-tauri/src/model_manager.rs`: dead code in download/disk-space helpers.
- `src-tauri/src/engine/model_store.rs`: unused `app` argument.

### Source Size Baseline

Largest frontend files:

| Lines | File |
| ---: | --- |
| 1150 | `src/App.tsx` |
| 356 | `src/components/ComparisonSlider.tsx` |
| 310 | `src/components/BatchQueueView.tsx` |
| 263 | `src/components/Titlebar.tsx` |
| 226 | `src/components/AdvancedSettings.tsx` |
| 198 | `src/components/SettingsPanel.tsx` |

Largest Rust files:

| Lines | File |
| ---: | --- |
| 626 | `src-tauri/src/video_pipeline.rs` |
| 526 | `src-tauri/src/job_queue.rs` |
| 503 | `src-tauri/src/lib.rs` |
| 351 | `src-tauri/src/sidecar_manager.rs` |
| 328 | `src-tauri/src/model_manager.rs` |
| 225 | `src-tauri/src/process_runner.rs` |
| 210 | `src-tauri/src/engine/model_store.rs` |
| 202 | `src-tauri/src/engine/registry_provider.rs` |
| 172 | `src-tauri/src/engine/param_parser.rs` |

## Audit Findings

### A1. `App.tsx` Is The Frontend Orchestrator Bottleneck

Location: `src/App.tsx`

Why it needs refactoring:

- `App` owns GPU discovery, settings hydration/persistence, model catalog refresh, media selection, media dimension probing, queue state, job event listeners, history writes, toast formatting, keyboard shortcuts, batch orchestration, and top-level rendering.
- The component carries 30+ state values and refs, making state transitions difficult to reason about and hard to test without rendering the whole app.
- Job status is normalized ad hoc in event handlers while lifecycle helpers already exist in `src/lib/types.ts`.
- Every change to job lifecycle, queue, history, model state, or settings risks re-render churn across the entire app.

Recommended extraction boundaries:

- `src/hooks/useSettings.ts`
- `src/hooks/useModelCatalog.ts`
- `src/hooks/useMediaSelection.ts`
- `src/hooks/useJobEvents.ts`
- `src/hooks/useUpscaleQueue.ts`
- `src/lib/outputPaths.ts`
- `src/lib/toasts.ts`

### A2. Batch Flow Uses Polling And Shared Mutable Output State

Location: `src/App.tsx`

Why it needs refactoring:

- `handleStartBatchUpscale` waits for each job with `setInterval` and nested `setBatchItems`, which couples sequencing to React render state.
- `pendingOutputPath` is a single global ref. In batch runs, concurrent or rapidly sequenced events can assign output paths to the wrong item.
- Batch and single-file paths duplicate output filename construction, request construction, state resets, and toast behavior.

Performance and correctness impact:

- Polling every 300 ms creates unnecessary wakeups and makes tests timing-sensitive.
- The global pending path can corrupt history and "show in explorer" behavior when backend output reservation changes the path.

Recommended direction:

- Replace polling with a reducer-driven queue state machine keyed by `jobId`.
- Treat backend `output_path` events as authoritative.
- Add a `jobId -> outputPath` map until the backend returns reserved paths directly.

### A3. Large Interactive Components Mix Rendering, Derived Data, And Interaction Logic

Locations:

- `src/components/BatchQueueView.tsx`
- `src/components/ComparisonSlider.tsx`
- `src/components/Titlebar.tsx`
- `src/components/SettingsPanel.tsx`
- `src/components/AdvancedSettings.tsx`

Why they need refactoring:

- Components exceed local lint thresholds for lines and complexity.
- Repeated inline style objects and status/category branching increase render-time allocation and make snapshot/unit tests noisy.
- `BatchQueueView` computes batch summaries, drag-reorder state, row status colors, row media sources, and full row rendering in one component.
- `ComparisonSlider` owns media loading, dimension state, slider drag, panning, keyboard/mouse behavior, and display-mode rendering.
- `Titlebar` couples GPU/model/status summaries with native window commands.

Recommended extraction boundaries:

- `BatchQueueSummary`, `BatchQueueRow`, `useBatchReorder`, and `getBatchStats`.
- `useComparisonMedia`, `useComparisonDrag`, `ComparisonToolbar`, and `ComparisonViewport`.
- `GpuSelector`, `WindowControls`, and `TitlebarStatus`.
- Presentational sections for settings panels, with derived selectors in small pure helpers.

### A4. Rust Tauri Command Layer Is Too Broad

Location: `src-tauri/src/lib.rs`

Why it needs refactoring:

- `lib.rs` mixes Tauri command registration, request/response DTOs, model catalog mapping, settings commands, file/path commands, native window commands, diagnostics, update checks, download commands, and upscale command orchestration.
- Several command pairs are aliases over the same implementation (`list_gpus`/`get_gpus`, `list_installed_models`/`get_installed_models`, `cancel_upscale`/`cancel_active_job`).
- `upscale_image` has 9 arguments and is only wrapped by `run_upscale`, making the public command surface inconsistent.

Recommended extraction boundaries:

- `src-tauri/src/commands/gpu.rs`
- `src-tauri/src/commands/models.rs`
- `src-tauri/src/commands/upscale.rs`
- `src-tauri/src/commands/settings.rs`
- `src-tauri/src/commands/files.rs`
- `src-tauri/src/commands/diagnostics.rs`
- Keep `lib.rs` focused on `Builder`, plugin setup, command registration, and app lifecycle hooks.

### A5. Video Pipeline Is A Long Sequential Procedure

Location: `src-tauri/src/video_pipeline.rs`

Why it needs refactoring:

- `run_video_job` performs temp directory setup, ffprobe validation, frame extraction, process polling, frame counting, NCNN invocation, progress estimation, extension sampling, encoder fallback, and cleanup in one 400+ line function.
- Cancellation handle management is repeated across process phases.
- Frame extension detection is case-sensitive.
- Multiple path conversions use `to_str().unwrap()`, which can panic on non-UTF-8 paths.

Performance and reliability impact:

- Repeated directory scans of frame folders are necessary in places, but the scanning/polling logic is embedded in orchestration and cannot be optimized or tested independently.
- A cancellation bug in any subprocess phase can leave external processes running.
- Encoder fallback behavior is difficult to verify because it is mixed into the main job runner.

Recommended extraction boundaries:

- `VideoJobContext` for paths, binaries, job id, scale, and cancellation.
- `extract_frames`, `count_frames`, `upscale_frames`, `sample_output_extension`, `reassemble_video`, `run_cancellable_process`.
- `EncoderStrategy` to make audio preservation/fallback behavior explicit.

### A6. Global Queue State Is Lock-Heavy And Procedural

Location: `src-tauri/src/job_queue.rs`

Why it needs refactoring:

- Queue, active registry, reserved output paths, and processing flag are global `Mutex` singletons.
- Lock acquisition and event emission are interleaved across a long `process_next_job` loop.
- `unwrap()` on mutex locks is widespread, so poisoned locks panic instead of reporting controlled job failures.
- Queued cancellation and output path reservation have correctness risk, already called out in the existing audit.

Recommended direction:

- Introduce a `JobQueueService` struct with injected runner/event emitter abstractions.
- Move state transitions into a `JobState` enum and reducer-like transition function.
- Return structured cancellation results: queued, active, already terminal, missing.
- Keep path reservation in a dedicated module with focused tests.

### A7. Model Catalog Resolution Repeats Disk And Parse Work

Location: `src-tauri/src/engine/model_store.rs`

Why it needs refactoring:

- `resolve_catalog` fetches or loads the registry, scans the model directory, checks existence, reads metadata, and parses NCNN param files in one pass.
- `determine_model_status` parses the `.param` file, then `resolve_catalog` parses it again to compute scale for installed registry models.
- Custom model discovery also parses metadata while deriving category from filename heuristics.

Performance impact:

- Catalog refreshes perform repeated filesystem and parse work. The frontend currently calls both `get_model_catalog` and `list_installed_models`, doubling part of the work.

Recommended direction:

- Split registry fetch/cache, local disk scan, metadata parse, status classification, and DTO mapping.
- Cache parsed param metadata per path/mtime during a catalog resolution.
- Prefer a single frontend catalog command over separate catalog and installed-model calls.

### A8. NCNN Param Parser Needs A Small Parser Pipeline

Location: `src-tauri/src/engine/param_parser.rs`

Why it needs refactoring:

- `parse_ncnn_param` performs file IO, header parsing, tokenization, layer classification, numeric parsing, scale math, and fallback selection in one function.
- Nested conditionals drive cognitive complexity above the configured threshold.
- Float-to-integer casts are unchecked and currently fail clippy.

Recommended direction:

- Split into `read_header`, `parse_layer_line`, `parse_layer_params`, `scale_factor_for_layer`, and `finalize_metadata`.
- Use checked conversion/range validation before multiplying scale.
- Add parser tests for malformed headers, comments/blank lines, each supported layer type, invalid numeric values, and overflow/large scale protection.

### A9. Formatting And Encoding Debt Will Obscure Refactors

Locations:

- 29 frontend files fail Prettier check.
- `src-tauri/src/lib.rs` fails `cargo fmt --check`.
- Several files and scripts show mojibake in text/glyphs.

Why it needs refactoring first:

- Mechanical formatting mixed with behavioral extraction will make diffs hard to review.
- Mojibake can hide user-facing text regressions and makes validation scripts hard to read in Windows shells.

Recommended direction:

- Run formatting as its own first commit.
- Normalize damaged user-facing glyphs and validator script output in a separate text-only pass.
- Add non-mutating format checks to CI/gate commands.

### A10. Test Coverage Does Not Yet Protect Refactoring Hotspots

Why it needs refactoring support:

- Current Vitest coverage is narrow: 5 files, 10 tests.
- Current Rust coverage is narrow: 12 tests, mostly helpers and process-runner mocks.
- The most important refactor targets (`App` orchestration, queue transitions, video pipeline phases, model catalog resolution) have limited or no direct tests.

Recommended direction:

- Add tests before extraction for state transitions, queue events, output path mapping, model catalog classification, and video pipeline phase orchestration with mocked process runners.

## Step-By-Step Implementation Plan

Each phase is designed for an autonomous AI agent. Keep commits atomic. Do not mix mechanical formatting, test additions, and behavior-preserving extraction in the same commit.

### Phase 0. Freeze Baseline And Add Non-Mutating Gate Scripts

Files:

- `package.json`
- `docs/REFACTORING_PLAN.md`

Actions:

1. Add explicit check scripts that do not modify files:
   - `format:ts:check`: `prettier --check "src/**/*.{ts,tsx,css}"`
   - `format:rust:check`: `cargo fmt --manifest-path src-tauri/Cargo.toml --check`
   - `check:quality`: run type check, lint, tests, build, Rust tests, clippy, and format checks with `npm.cmd` documented for Windows.
2. Do not relax lint or clippy thresholds.
3. Record the known failing baseline in this document until fixed.

Verify after phase:

```powershell
npm.cmd run check:ts
npm.cmd run test
npm.cmd run build
cargo test --manifest-path src-tauri/Cargo.toml
npx.cmd prettier --check "src/**/*.{ts,tsx,css}"
cargo fmt --manifest-path src-tauri/Cargo.toml --check
npm.cmd run check:rust
```

Done when:

- New non-mutating scripts exist.
- The same baseline pass/fail pattern is reproducible.

### Phase 1. Mechanical Formatting And Text Normalization

Files:

- `src/**/*.{ts,tsx,css}`
- `src-tauri/src/**/*.rs`
- `scripts/*.ps1`
- User-facing component text files with mojibake.

Actions:

1. Run Prettier on frontend files and `cargo fmt` on Rust files.
2. Fix mojibake in user-visible text and validator output without changing behavior.
3. Add a lightweight text scan script or test for common damaged sequences if practical.

Avoid:

- Do not extract components or alter logic in this phase; this should be a mostly mechanical diff.

Verify after phase:

```powershell
npx.cmd prettier --check "src/**/*.{ts,tsx,css}"
cargo fmt --manifest-path src-tauri/Cargo.toml --check
npm.cmd run check:ts
npm.cmd run test
cargo test --manifest-path src-tauri/Cargo.toml
```

Done when:

- Frontend and Rust format checks pass.
- Existing tests still pass.

### Phase 2. Add Refactor Safety Tests For Shared State

Files:

- `src/lib/types.ts`
- `src/lib/outputPaths.ts` (new)
- `src/lib/jobState.ts` (new if state helpers move out of `types.ts`)
- `src/lib/__tests__/jobState.test.ts` (new)
- `src/lib/__tests__/outputPaths.test.ts` (new)
- `src/components/__tests__/JobStateLifecycle.test.tsx`

Actions:

1. Move pure job lifecycle helpers into a small tested module if needed.
2. Add tests for valid/invalid transitions, terminal-state idempotency, backend status normalization, and output filename construction.
3. Add tests for per-job output path mapping so batch work is protected before changing `App.tsx`.

Verify after phase:

```powershell
npm.cmd run check:ts
npm.cmd run test
npm.cmd run lint:ts
```

Done when:

- New tests fail if status normalization or output-path mapping regresses.
- No production behavior has changed.

### Phase 3. Extract Frontend Settings, Models, And Media Selection

Files:

- `src/App.tsx`
- `src/hooks/useSettings.ts` (new)
- `src/hooks/useModelCatalog.ts` (new)
- `src/hooks/useMediaSelection.ts` (new)
- `src/lib/media.ts`
- `src/lib/models.ts`
- Related hook tests if added.

Actions:

1. Extract settings load/save and muted state into `useSettings`.
2. Extract model catalog refresh, installed-model state, download progress, and model selection helpers into `useModelCatalog`.
3. Extract file/folder picker handling, media dimension probing, and initial batch item creation into `useMediaSelection`.
4. Keep hook APIs explicit and small; avoid a single "app state" hook that recreates the monolith.

Verify after phase:

```powershell
npm.cmd run check:ts
npm.cmd run test
npm.cmd run lint:ts
npm.cmd run build
```

Done when:

- `App` no longer owns settings/model/media picker internals.
- `App` complexity and lines decrease materially.
- Existing UI tests pass.

### Phase 4. Replace Frontend Batch Polling With Event-Driven Queue State

Files:

- `src/App.tsx`
- `src/hooks/useJobEvents.ts` (new)
- `src/hooks/useUpscaleQueue.ts` (new)
- `src/lib/jobState.ts`
- `src/lib/outputPaths.ts`
- `src/components/BatchQueueView.tsx`
- Related tests.

Actions:

1. Extract Tauri `job-status-changed` and `download-progress` listeners into `useJobEvents`.
2. Build `useUpscaleQueue` around a reducer keyed by stable job id.
3. Remove `setInterval` completion polling from batch sequencing.
4. Replace global `pendingOutputPath` with per-job output tracking.
5. Normalize backend statuses in one function.

Verify after phase:

```powershell
npm.cmd run check:ts
npm.cmd run test
npm.cmd run lint:ts
npm.cmd run build
```

Done when:

- Batch completion is driven by events, not interval polling.
- Output paths are job-specific.
- Existing batch and job lifecycle tests pass.

### Phase 5. Split Large Frontend Components Into Presentational Pieces

Files:

- `src/components/BatchQueueView.tsx`
- `src/components/ComparisonSlider.tsx`
- `src/components/Titlebar.tsx`
- `src/components/SettingsPanel.tsx`
- `src/components/AdvancedSettings.tsx`
- New child components/hooks under `src/components/*` or `src/hooks/*`.

Actions:

1. Extract pure helpers first, then child components.
2. Keep public props stable until all tests pass.
3. Move repeated status/color/summary calculations into pure helpers with tests where branches are dense.
4. Preserve visual behavior; this is not a redesign phase.

Verify after phase:

```powershell
npm.cmd run check:ts
npm.cmd run test
npm.cmd run lint:ts
npm.cmd run build
```

Done when:

- Each touched component is under lint thresholds or has only justified residual warnings.
- Existing component tests pass without broad snapshot rewrites.

### Phase 6. Modularize Rust Command Registration

Files:

- `src-tauri/src/lib.rs`
- `src-tauri/src/commands/mod.rs` (new)
- `src-tauri/src/commands/gpu.rs` (new)
- `src-tauri/src/commands/models.rs` (new)
- `src-tauri/src/commands/upscale.rs` (new)
- `src-tauri/src/commands/settings.rs` (new)
- `src-tauri/src/commands/files.rs` (new)
- `src-tauri/src/commands/diagnostics.rs` (new)

Actions:

1. Move command implementations into domain modules.
2. Keep command names stable for Tauri IPC compatibility.
3. Convert high-argument internal calls to request structs.
4. Deduplicate command aliases or route them through a clearly named shared function.

Verify after phase:

```powershell
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo test --manifest-path src-tauri/Cargo.toml
npm.cmd run check:rust
npm.cmd run build
```

Done when:

- `lib.rs` mainly wires modules, plugins, command handlers, and lifecycle.
- Tauri command names remain compatible with frontend `invoke` calls.

### Phase 7. Refactor Queue Service And Output Reservation

Files:

- `src-tauri/src/job_queue.rs`
- `src-tauri/src/job_state.rs` (new if useful)
- `src-tauri/src/output_paths.rs` (new if useful)
- Rust tests in relevant modules.

Actions:

1. Introduce a `JobQueueService` abstraction around queue, registry, reserved paths, and event emission.
2. Replace string statuses with an internal enum and convert to IPC payload strings at the boundary.
3. Replace mutex `unwrap()` calls with controlled error handling.
4. Add direct tests for queued cancellation, active cancellation, unknown job cancellation, terminal idempotency, and output reservation with 2x/3x/4x suffixes.

Verify after phase:

```powershell
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo test --manifest-path src-tauri/Cargo.toml
npm.cmd run check:rust
npm.cmd run test
```

Done when:

- Queue behavior is testable without full Tauri app execution.
- Cancellation and reservation tests cover prior audit risks.

### Phase 8. Decompose Video Pipeline

Files:

- `src-tauri/src/video_pipeline.rs`
- `src-tauri/src/video_pipeline/context.rs` (new optional)
- `src-tauri/src/video_pipeline/ffmpeg.rs` (new optional)
- `src-tauri/src/video_pipeline/encoder.rs` (new optional)
- `src-tauri/src/process_runner.rs`

Actions:

1. Extract a context struct for paths, binaries, job metadata, and cancellation.
2. Extract process-running helper that always registers the active handle.
3. Split extract, count, upscale, extension sample, and reassemble phases.
4. Make audio/encoder fallback behavior explicit in return metadata.
5. Replace path `unwrap()` with fallible conversion and clear errors.

Verify after phase:

```powershell
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo test --manifest-path src-tauri/Cargo.toml
npm.cmd run check:rust
```

Optional manual fixture verification when sidecars and media fixtures are present:

```powershell
npm.cmd run benchmark
```

Done when:

- `run_video_job` is a readable orchestration function.
- Each video phase can be tested with a mocked `ProcessRunner`.

### Phase 9. Split And Cache Model Catalog Resolution

Files:

- `src-tauri/src/engine/model_store.rs`
- `src-tauri/src/engine/registry_provider.rs`
- `src-tauri/src/engine/param_parser.rs`
- `src-tauri/src/lib.rs` or `src-tauri/src/commands/models.rs`
- Frontend model catalog hook from Phase 3.

Actions:

1. Split registry fetch/cache from local model discovery.
2. Cache param parser results per path/mtime inside a single catalog resolution.
3. Return one catalog payload that includes installed/update/corrupt status so frontend can stop calling both `get_model_catalog` and `list_installed_models`.
4. Add parser and model-store tests for corrupt, missing-bin, custom, installed, and update-available cases.

Verify after phase:

```powershell
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo test --manifest-path src-tauri/Cargo.toml
npm.cmd run check:rust
npm.cmd run check:ts
npm.cmd run test
```

Done when:

- Catalog resolution avoids duplicate parse work.
- Frontend model state comes from one authoritative command.

### Phase 10. Final Gate Closure

Files:

- Any remaining files with lint/clippy warnings.
- `docs/REFACTORING_PLAN.md`

Actions:

1. Remove residual ESLint and clippy warnings without weakening thresholds.
2. Confirm format checks pass.
3. Update this document's baseline section or add a completion note with final results.

Final verification:

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

Done when:

- All gates pass from a clean working tree.
- No lint/clippy thresholds are relaxed.
- Refactors are covered by focused tests and behavior remains unchanged.

## Verification Strategy

### Per-Phase Minimum

Run the smallest relevant set after every phase:

- Frontend-only phase:

```powershell
npm.cmd run check:ts
npm.cmd run test
npm.cmd run lint:ts
npm.cmd run build
```

- Rust-only phase:

```powershell
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo test --manifest-path src-tauri/Cargo.toml
npm.cmd run check:rust
```

- Cross-boundary phase:

```powershell
npm.cmd run check:ts
npm.cmd run test
npm.cmd run build
cargo test --manifest-path src-tauri/Cargo.toml
npm.cmd run check:rust
```

### Regression Checks By Risk Area

| Risk area | Required checks |
| --- | --- |
| Frontend job lifecycle | Unit tests for status normalization and terminal transitions; Vitest component tests for progress/completion/cancel events. |
| Batch queue | Tests for multiple job ids, per-job output paths, cancellation, retry from error state, and no interval polling. |
| Output paths | Tests for default directory, custom directory, Windows separators, filename collisions, and correct scale suffix. |
| Tauri IPC compatibility | TypeScript check plus a grep review of every `invoke("...")` against registered command names. |
| Rust queue service | Rust tests for queue order, cancellation states, poisoned lock/error handling where applicable, and output reservation release. |
| Video pipeline | Mocked process-runner tests for extract/upscale/reassemble success, failure, and cancellation during each phase. |
| Model catalog | Rust tests for registry fallback, cached manifest, missing files, corrupt param, empty bin, and custom model discovery. |
| Formatting/encoding | Prettier check, cargo fmt check, and text scan for known mojibake sequences. |

### Full Final Gate

Use this command set before declaring the refactor complete:

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

Known environment note:

- In this Windows PowerShell environment, `npm` may resolve to the blocked `npm.ps1` shim. Use `npm.cmd` for reproducible gate runs unless the local execution policy is changed.

