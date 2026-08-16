---
phase: 3
plan: 2
wave: 2
---

# Plan 3.2: Multi-Phase Progress Overlay & Completion Hero Card

## Objective
Build the multi-phase processing progress overlay with SVG liquid wave fill bar, ETA/FPS counters, red liquid cancel pill, and the success hero completion card with native OS file actions (`Open File`, `Show in Explorer`).

## Context
- `.gsd/SPEC.md`
- `.gsd/ARCHITECTURE.md`
- `.gsd/phases/3/RESEARCH.md`
- `src/components/ProgressOverlay.tsx`
- `src/components/CompletionCard.tsx`
- `src/hooks/useUpscale.ts`
- `src/App.tsx`

## Tasks

<task type="auto">
  <name>Build ProgressOverlay component with live IPC phase streaming</name>
  <files>src/components/ProgressOverlay.tsx, src/hooks/useUpscale.ts</files>
  <action>
    1. Build `ProgressOverlay.tsx` featuring an animated SVG liquid wave fill bar in `Vanilla` (`#F1FEC8`).
    2. Display exact percentage counter (`68.4%`), ETA timer (`~14s left`), video frame counter (`24 fps`), and live phase badge (`Extracting` → `Upscaling` → `Reassembling`).
    3. Include prominent red liquid cancel pill button that triggers non-blocking process termination.
  </action>
  <verify>npm run build</verify>
  <done>ProgressOverlay renders liquid wave fill and updates percentage/ETA in real-time from IPC events</done>
</task>

<task type="auto">
  <name>Build CompletionCard with Native OS File Actions</name>
  <files>src/components/CompletionCard.tsx, src/App.tsx</files>
  <action>
    1. Build `CompletionCard.tsx` hero banner featuring sparkle celebration burst upon 100% completion.
    2. Display output file path, final resolution (`3840x2160`), file size, and scale factor badge.
    3. Wire action buttons using `@tauri-apps/plugin-opener`:
       - `Open File`: opens upscaled file in native Windows app
       - `Show in Explorer`: opens file location in File Explorer with item highlighted
       - `Upscale Another`: resets state machine back to empty dropzone.
  </action>
  <verify>npm run build</verify>
  <done>CompletionCard displays output metadata and native Explorer actions launch Windows applications</done>
</task>

## Success Criteria
- [ ] `npm run build` succeeds with 0 errors
- [ ] Liquid wave progress bar animates smoothly during processing
- [ ] Native OS file actions open files and folders in Windows Explorer
