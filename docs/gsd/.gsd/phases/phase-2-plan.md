# Phase 2 Plan: Mechanical Formatting and Text Normalization

> **Milestone**: `Refactor Modularization Quality Gate`
> **Phase**: Phase 2 — Mechanical formatting and text normalization
> **Objective**: Execute automated formatting across frontend and Rust codebases and repair text/encoding mojibake without changing logic or behavior.

---

## Tasks

### Task 2.1: Run mechanical formatting pass on frontend and Rust
- **Target Files**: `src/**/*.{ts,tsx,css}`, `src-tauri/src/**/*.rs`
- **Actions**:
  - Run `npx.cmd prettier --write "src/**/*.{ts,tsx,css}"`
  - Run `cargo fmt --manifest-path src-tauri/Cargo.toml`
- **Verification Commands**:
  - `npm.cmd run format:ts:check`
  - `npm.cmd run format:rust:check`

### Task 2.2: Text normalization and UTF-8 mojibake repair
- **Target Files**: `scripts/*.ps1`, UI component strings
- **Actions**: Add explicit UTF-8 console output encoding to PowerShell validator scripts.
- **Verification Commands**:
  - `npm.cmd run check:ts`
  - `npm.cmd run test`
  - `powershell -ExecutionPolicy Bypass -File scripts\validate-all.ps1`

---

## Acceptance Gate Checklist (Phase 2)
- [ ] `npm.cmd run format:ts:check` passes with 0 warnings.
- [ ] `npm.cmd run format:rust:check` passes with 0 diffs.
- [ ] `npm.cmd run check:ts` passes cleanly.
- [ ] `npm.cmd run test` passes cleanly (10/10 tests).
- [ ] `cargo test --manifest-path src-tauri/Cargo.toml` passes cleanly (12/12 tests).
- [ ] PowerShell script validator runs with clean UTF-8 text.
