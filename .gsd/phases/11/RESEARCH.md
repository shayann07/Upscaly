---
phase: 11
level: 1
researched_at: 2026-08-09
---

# Phase 11 Research: Final Gate Closure

## Questions Investigated
1. **What remaining Clippy warnings need resolution?**
   - Redundant closures on `.unwrap_or_else(PoisonError::into_inner)`.
   - `uninlined_format_args` in `video_pipeline/phases.rs` and `video_pipeline/encoder.rs`.
   - Unused variables/imports across `model_manager.rs`, `sidecar_manager.rs`, and `engine/model_store.rs`.
   - `too_many_lines` (>100) on `upscale_frames` in `video_pipeline/phases.rs`.
   - `cast_precision_loss` and `cast_possible_truncation` in video pipeline progress math.

2. **How to organize Phase 11 tasks?**
   - Plan 11.1: Fix all remaining Clippy warnings in Rust codebase (`src-tauri/src/**/*.rs`) to achieve 0 warnings under `cargo clippy -- -D warnings`.
   - Plan 11.2: Run full quality gate check suite (`check:ts`, `lint:ts`, `test`, `build`, `check:rust`, `format:check:all`).

## Decisions Made
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Function Splitting | Decompose `upscale_frames` into `spawn_upscale_engine` and `poll_upscale_progress` | Keeps function line count under 100 lines |
| Lock Recovery Helper | `safe_lock` helper method | Eliminates redundant `.unwrap_or_else(|p| p.into_inner())` closures |
| Unused Code Annotations | Prefix unused parameters with `_` or add `#[allow(dead_code)]` for future extension functions | Keeps codebase clean while retaining necessary API contracts |

## Verification Strategy
- `npm.cmd run check:rust` (`cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings`) -> 0 warnings
- `npm.cmd run lint:ts` (`eslint src --max-warnings 0`) -> 0 warnings
- `npm.cmd run check:ts` -> 0 errors
- `npm.cmd run test` -> 37/37 Vitest tests pass
- `cargo test --manifest-path src-tauri/Cargo.toml` -> 15/15 Rust tests pass
- `npm.cmd run build` -> Vite build succeeds
