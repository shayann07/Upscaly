---
phase: 4
plan: 1
wave: 1
---

# Plan 4.1: GitHub Model Updates, Sound Synthesis & Settings Store

## Objective
Implement automatic GitHub Releases model discovery with downloadable model modal, native Web Audio API sound synthesis for Apple-like UI feedback, and persistent user settings (`settings.json`).

## Context
- `.gsd/SPEC.md`
- `.gsd/ARCHITECTURE.md`
- `.gsd/phases/4/RESEARCH.md`
- `src-tauri/src/model_manager.rs`
- `src-tauri/src/settings.rs`
- `src/lib/sound.ts`
- `src/components/UpdateBadge.tsx`
- `src/components/Titlebar.tsx`

## Tasks

<task type="auto">
  <name>Build GitHub model updates check & download modal</name>
  <files>src-tauri/src/model_manager.rs, src/components/UpdateBadge.tsx</files>
  <action>
    1. In `model_manager.rs`, implement `check_github_updates` querying `https://api.github.com/repos/xinntao/Real-ESRGAN/releases/latest`.
    2. Build `src/components/UpdateBadge.tsx` showing a glowing Vanilla (`#F1FEC8`) dot badge on the model selector pill when an update is available.
    3. Clicking the badge opens a liquid glass release notes modal with a one-click `Download & Install` progress bar and SHA-256 validation.
  </action>
  <verify>npm run build</verify>
  <done>UpdateBadge displays glowing notification when a newer model version exists on GitHub</done>
</task>

<task type="auto">
  <name>Implement Web Audio API Sound Synthesis & Settings Store</name>
  <files>src/lib/sound.ts, src-tauri/src/settings.rs, src/components/Titlebar.tsx</files>
  <action>
    1. Create `src/lib/sound.ts` synthesizing soft UI sound effects dynamically using `AudioContext` (file drop chime, completion pop, error tone).
    2. Add sound mute toggle pill to `Titlebar.tsx` header.
    3. Implement `settings.rs` storing GPU preference, default scale, tile size, output folder, and sound mute state in `app_data_dir/settings.json`.
  </action>
  <verify>npm run build</verify>
  <done>Web Audio API plays sound feedback on actions and settings persist across restarts</done>
</task>

## Success Criteria
- [ ] `npm run build` succeeds with 0 errors
- [ ] UpdateBadge detects remote model updates from GitHub Releases API
- [ ] Sound synthesis plays UI audio feedback with instant mute toggle support
- [ ] Settings store persists user preferences in `app_data_dir/settings.json`
