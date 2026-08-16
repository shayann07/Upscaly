---
phase: 2
plan: 2
wave: 2
---

# Plan 2.2: Atropos 3D Dropzone, Settings Accordion & Liquid Shimmer CTA

## Objective
Build the Atropos 3D tilt dropzone card with floating format tags, file preview card, model selector tabs, scale factor buttons, expandable advanced settings accordion, Liquid Shimmer CTA button, and Framer Motion spring toast container.

## Context
- `.gsd/SPEC.md`
- `.gsd/ARCHITECTURE.md`
- `.gsd/phases/2/RESEARCH.md`
- `src/components/DropZone.tsx`
- `src/components/FilePreview.tsx`
- `src/components/SettingsPanel.tsx`
- `src/components/AdvancedSettings.tsx`
- `src/components/UpscaleButton.tsx`
- `src/components/ToastContainer.tsx`

## Tasks

<task type="auto">
  <name>Build Atropos 3D DropZone and FilePreview components</name>
  <files>src/components/DropZone.tsx, src/components/FilePreview.tsx</files>
  <action>
    1. Build `src/components/DropZone.tsx` using Atropos 3D parallax tilt, floating Phosphor `UploadSimple` icon, format pills (`PNG`, `JPG`, `WEBP`, `MP4`), and liquid warp drag highlight.
    2. Build `src/components/FilePreview.tsx` displaying thumbnail, target resolution calculation (`1080p → 4K UHD`), size stats, hover zoom lens, and quick-remove glass button.
  </action>
  <verify>npm run build</verify>
  <done>DropZone renders 3D mouse tilt and FilePreview displays thumbnail with target resolution calculation</done>
</task>

<task type="auto">
  <name>Build SettingsPanel, AdvancedSettings, UpscaleButton & ToastContainer</name>
  <files>src/components/SettingsPanel.tsx, src/components/AdvancedSettings.tsx, src/components/UpscaleButton.tsx, src/components/ToastContainer.tsx</files>
  <action>
    1. Build `src/components/SettingsPanel.tsx` with category tabs (`Photos` | `Anime & Art` | `Video`), Framer Motion sliding selection pill, friendly model titles, and `2x`/`3x`/`4x` scale buttons.
    2. Build `src/components/AdvancedSettings.tsx` collapsible spring drawer with GPU selector dropdown, VRAM tile size guidance tooltips, and custom output path picker.
    3. Build `src/components/UpscaleButton.tsx` Liquid Shimmer Pill CTA (`Vanilla` → `Lavender` fill) with 30px magnetic cursor pull and click ripple.
    4. Build `src/components/ToastContainer.tsx` floating toast stack with Framer Motion spring animations and swipe-to-dismiss.
  </action>
  <verify>npm run build</verify>
  <done>Settings controls render with spring sliding tab indicators and UpscaleButton exhibits magnetic hover</done>
</task>

## Success Criteria
- [ ] `npm run build` succeeds with 0 errors
- [ ] Atropos 3D dropzone card tilts in 3D on mouse movement
- [ ] UpscaleButton pulls magnetically toward cursor within 30px
- [ ] ToastContainer animates toast entries with spring physics
