---
phase: 8
level: 1
researched_at: 2026-08-09
---

# Phase 8 Research: Refactor Rust Queue Service and Output Reservation

## Questions Investigated
1. **How should `JobState` enum be defined in `src-tauri/src/job_state.rs`?**
   - Define `JobState` enum with variants: `Queued`, `Running`, `Succeeded`, `Failed(String)`, `Cancelled`.
   - Provide helper methods for status string conversions (`as_str()`, `is_terminal()`) and serialization.

2. **How to organize path reservation in `src-tauri/src/output_paths.rs`?**
   - Extract `reserve_output_path` and `release_output_path` into `output_paths.rs`.
   - Ensure clean path collision resolution logic for `2x`, `3x`, `4x` scaling factors and sequential index counters (`_4x (1).png`, `_4x (2).png`).

3. **How should `JobQueueService` be structured?**
   - Encapsulate the `VecDeque<Job>`, active registry (`HashMap<String, JobControl>`), processing flag, and output path reservations inside `JobQueueService`.
   - Replace raw `.lock().unwrap()` calls with safe lock access helpers.

## Decisions Made
| Decision | Choice | Rationale |
|----------|--------|-----------|
| State Enum | `JobState` in `src-tauri/src/job_state.rs` | Eliminates magic strings and provides type-safe state transitions |
| Path Reservation Module | `src-tauri/src/output_paths.rs` | Decouples path string math from job execution queue |
| Safe Mutex Locks | `lock_or_recover` helper method | Prevents lock poisoning crashes from crashing the worker loop |

## Verification Strategy
- `cargo test --manifest-path src-tauri/Cargo.toml`
- Direct unit tests in `output_paths.rs` and `job_queue.rs` verifying path collision index incrementing and job cancellation state handling.
