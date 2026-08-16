---
phase: 1
plan: 1
wave: 1
---

# Plan 1.1: Rust Errors, Windows Job Objects & Process Safety

## Objective
Implement a robust, non-blocking Rust backend foundation for Upscaly with typed `AppError` enum serialization, `tracing` file logging, Windows Job Object child process tree auto-kill, and async GPU discovery caching with a 5-second timeout.

## Context
- `.gsd/SPEC.md`
- `.gsd/ARCHITECTURE.md`
- `.gsd/phases/1/RESEARCH.md`
- `src-tauri/Cargo.toml`
- `src-tauri/src/lib.rs`
- `src-tauri/src/sidecar_manager.rs`

## Tasks

<task type="auto">
  <name>Add dependencies, AppError enum & tracing logger</name>
  <files>src-tauri/Cargo.toml, src-tauri/src/error.rs, src-tauri/src/lib.rs</files>
  <action>
    1. Add `thiserror = "1.0"` and `tracing` + `tracing-appender` crates to `src-tauri/Cargo.toml`.
    2. Create `src-tauri/src/error.rs` defining the `AppError` enum with typed variants (`SidecarNotFound`, `GpuError`, `InsufficientStorage`, `InvalidFileFormat`, `NetworkError`) and `serde::Serialize` implementation.
    3. Initialize `tracing-appender` file logging in `src-tauri/src/lib.rs` writing to `app_data_dir/logs/upscaly.log` with a 5MB rotation policy.
  </action>
  <verify>cd src-tauri && cargo check</verify>
  <done>Cargo check succeeds with 0 errors and AppError is serializable over IPC</done>
</task>

<task type="auto">
  <name>Implement Windows Job Objects & Async GPU Probe with Cache</name>
  <files>src-tauri/src/sidecar_manager.rs</files>
  <action>
    1. In `sidecar_manager.rs`, implement Win32 Job Object creation (`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`) to attach to all spawned sidecar child processes, guaranteeing process tree auto-kill on app exit.
    2. Refactor `probe_gpus` to check `app_data_dir/gpu_cache.json` first on launch for instant startup (<10ms).
    3. Wrap background GPU discovery in `tokio::time::timeout(Duration::from_secs(5))` fallback to default GPU if timeout is reached.
  </action>
  <verify>cd src-tauri && cargo check</verify>
  <done>GPU discovery loads instantly from cache and sidecar child processes are bound to Windows Job Objects</done>
</task>

## Success Criteria
- [ ] `cargo check` passes with 0 warnings
- [ ] `AppError` provides structured JSON error objects across Tauri IPC
- [ ] Sidecar processes auto-terminate on parent exit via Windows Job Objects
- [ ] GPU discovery reads from disk cache and limits background scans to 5 seconds
