---
phase: 5
plan: 1
wave: 1
---

# Plan 5.1: Rust Backend Unit Test Suite

## Objective
Implement comprehensive Rust unit tests covering `AppError` IPC serialization, `AppSettings` JSON persistence, SHA-256 file hashing, and sidecar path resolution.

## Context
- `.gsd/SPEC.md`
- `.gsd/ARCHITECTURE.md`
- `.gsd/phases/5/RESEARCH.md`
- `src-tauri/src/error.rs`
- `src-tauri/src/settings.rs`
- `src-tauri/src/model_manager.rs`
- `src-tauri/src/sidecar_manager.rs`

## Tasks

<task type="auto">
  <name>Implement AppError & AppSettings unit tests</name>
  <files>src-tauri/src/error.rs, src-tauri/src/settings.rs</files>
  <action>
    1. In `src-tauri/src/error.rs`, add a `#[cfg(test)]` module testing Serde JSON serialization of all `AppError` variants (`SidecarNotFound`, `GpuError`, `InsufficientStorage`, `InvalidFileFormat`, `NetworkError`, `ExecutionError`, `Cancelled`).
    2. In `src-tauri/src/settings.rs`, add a `#[cfg(test)]` module testing `AppSettings::default()` values and JSON round-trip serialization/deserialization.
  </action>
  <verify>cd src-tauri && cargo test</verify>
  <done>Cargo test passes with 100% test success on AppError and AppSettings</done>
</task>

<task type="auto">
  <name>Implement SHA-256 & Sidecar Path unit tests</name>
  <files>src-tauri/src/model_manager.rs, src-tauri/src/sidecar_manager.rs</files>
  <action>
    1. In `src-tauri/src/model_manager.rs`, add a `#[cfg(test)]` module testing SHA-256 hash calculation on a temporary test file.
    2. In `src-tauri/src/sidecar_manager.rs`, add a `#[cfg(test)]` module testing GpuDevice struct serialization and sorting logic.
  </action>
  <verify>cd src-tauri && cargo test</verify>
  <done>All Rust backend unit tests execute and pass cleanly via cargo test</done>
</task>

## Success Criteria
- [ ] `cargo test` passes with 0 failures
- [ ] AppError serialization tests verify IPC JSON structure
- [ ] SHA-256 calculation tests verify digest output
