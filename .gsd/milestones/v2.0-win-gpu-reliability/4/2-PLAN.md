---
phase: 4
plan: 2
wave: 2
---

# Plan 4.2: Full Production Build Verification & Verification Suite

## Objective
Run full compilation verification across Rust backend and React frontend, ensuring zero warnings, zero TypeScript errors, and build a standalone desktop executable package.

## Context
- `.gsd/SPEC.md`
- `.gsd/ARCHITECTURE.md`
- `.gsd/phases/4/RESEARCH.md`
- `package.json`
- `src-tauri/Cargo.toml`

## Tasks

<task type="auto">
  <name>Run Cargo & TypeScript Zero-Warning Compilation Suite</name>
  <files>src-tauri/src/lib.rs, src/App.tsx</files>
  <action>
    1. Run `cargo check` inside `src-tauri` directory and resolve any Rust warnings or unused variable diagnostics.
    2. Run `npm run build` and resolve any TypeScript or JSX compilation warnings.
  </action>
  <verify>cd src-tauri && cargo check && cd .. && npm run build</verify>
  <done>Cargo check and npm run build both pass with 0 warnings and 0 errors</done>
</task>

<task type="auto">
  <name>Build Standalone Desktop Installer Package</name>
  <files>src-tauri/tauri.conf.json</files>
  <action>
    1. Execute `npx tauri build` to compile optimized release Rust binary and bundle frontend assets.
    2. Verify output executable in `src-tauri/target/release/` and installer bundle in `src-tauri/target/release/bundle/`.
  </action>
  <verify>npx tauri build</verify>
  <done>Tauri build produces standalone executable and NSIS installer without errors</done>
</task>

## Success Criteria
- [ ] `cargo check` passes with 0 warnings
- [ ] `npm run build` passes with 0 errors
- [ ] `npx tauri build` produces standalone desktop binary & installer
