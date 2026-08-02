---
phase: 1
plan: 2
wave: 2
---

# Plan 1.2: Job Engine, RAII Video Pipeline & Pre-flight Checks

## Objective
Refactor the job engine to lock-free concurrent state, implement an RAII temp folder cleanup guard in `video_pipeline.rs`, and add pre-flight disk storage and VRAM checks in `lib.rs`.

## Context
- `.gsd/SPEC.md`
- `.gsd/ARCHITECTURE.md`
- `.gsd/phases/1/RESEARCH.md`
- `src-tauri/src/job_engine.rs`
- `src-tauri/src/video_pipeline.rs`
- `src-tauri/src/lib.rs`

## Tasks

<task type="auto">
  <name>Refactor Job Engine to Lock-Free Concurrent AppState</name>
  <files>src-tauri/src/job_engine.rs, src-tauri/src/lib.rs</files>
  <action>
    1. Create `AppState` managed struct holding `Arc<RwLock<AppSettings>>` and `tokio::sync::Mutex<Option<ActiveJob>>`.
    2. Store `tokio::process::Child` handles inside `ActiveJob` for non-blocking single-job execution and clean cancellation.
    3. Expose IPC commands `start_upscale`, `cancel_upscale`, and `open_output_file`.
  </action>
  <verify>cd src-tauri && cargo check</verify>
  <done>Job engine uses managed AppState without static mutexes and supports IPC job cancellation</done>
</task>

<task type="auto">
  <name>Implement RAII TempFolderGuard & Pre-flight Storage Checks</name>
  <files>src-tauri/src/video_pipeline.rs, src-tauri/src/model_manager.rs, src-tauri/src/lib.rs</files>
  <action>
    1. Create `TempFolderGuard` RAII struct in `video_pipeline.rs` with `Drop` implementation to guarantee deletion of `app_data_dir/temp_video_jobs/<job_id>` folders on success, failure, or cancellation.
    2. Implement pre-flight storage validation before starting any job (check free disk space on target drive against estimated output size + 500MB margin).
    3. Implement resumable HTTP Range model downloader in `model_manager.rs` with SHA-256 digest validation.
  </action>
  <verify>cd src-tauri && cargo check</verify>
  <done>Temp video frames are auto-cleaned via Drop guard and pre-flight storage checks fail fast with actionable guidance</done>
</task>

## Success Criteria
- [ ] `cargo check` compiles with 0 errors
- [ ] `video_pipeline` temp directory is deleted on drop
- [ ] Pre-flight checks prevent upscaling when target storage space is insufficient
- [ ] Model downloader verifies SHA-256 digests before finalizing `.param`/`.bin` files
