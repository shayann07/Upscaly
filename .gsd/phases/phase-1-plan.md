# Phase 1 Plan: Freeze Baseline and Add Non-Mutating Quality Gate Scripts

> **Milestone**: `Refactor Modularization Quality Gate`
> **Phase**: Phase 1 — Freeze baseline and add non-mutating quality gate scripts
> **Objective**: Establish non-mutating npm script checks for formatting and full quality gate verification without relaxing any lint or clippy thresholds.

---

## Tasks

### Task 1.1: Add non-mutating format check scripts
- **Target File**: `package.json`
- **Actions**:
  - Add `"format:ts:check"`: `prettier --check "src/**/*.{ts,tsx,css}"`
  - Add `"format:rust:check"`: `cargo fmt --manifest-path src-tauri/Cargo.toml --check`
  - Add `"format:check:all"`: `npm run format:ts:check && npm run format:rust:check`
  - Add `"check:quality"`: `npm run check:ts && npm run lint:ts && npm run test && npm run check:rust && npm run format:check:all`
- **Verification Commands**:
  - `npm.cmd run format:ts:check`
  - `npm.cmd run format:rust:check`
- **Rules**: Do not weaken ESLint `--max-warnings 0` or Clippy `-D warnings`.

### Task 1.2: Record baseline audit state in documentation
- **Target File**: `docs/REFACTORING_PLAN.md`
- **Actions**: Verify baseline quality gate metrics are documented accurately (15 ESLint warnings, 160 Clippy warnings, 29 unformatted TS files).
- **Verification Commands**:
  - `npm.cmd run check:ts`
  - `npm.cmd run test`
  - `npm.cmd run build`

---

## Acceptance Gate Checklist (Phase 1)
- [ ] Non-mutating formatting check scripts added to `package.json`.
- [ ] Aggregate `check:quality` script defined.
- [ ] Zero lint/clippy thresholds modified or weakened.
- [ ] Reproduction of baseline pass/fail pattern verified.
