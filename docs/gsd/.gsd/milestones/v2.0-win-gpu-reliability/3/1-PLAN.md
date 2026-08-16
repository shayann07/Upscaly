---
phase: 3
plan: 1
wave: 1
---

# Plan 3.1: 60FPS Hardware Comparison Slider & Zoom Controls

## Objective
Build a hardware-accelerated 60fps Before/After comparison slider using CSS `clip-path`, `requestAnimationFrame` drag binding, glowing laser divider ray, and 100%/200%/400% zoom lens controls for fine texture inspection.

## Context
- `.gsd/SPEC.md`
- `.gsd/ARCHITECTURE.md`
- `.gsd/phases/3/RESEARCH.md`
- `src/components/ComparisonSlider.tsx`
- `src/App.tsx`

## Tasks

<task type="auto">
  <name>Build ComparisonSlider with 60fps clip-path dragging</name>
  <files>src/components/ComparisonSlider.tsx</files>
  <action>
    1. Build `ComparisonSlider.tsx` using `clip-path: inset(0 ${100 - pos}% 0 0)` on the After image layer.
    2. Bind mouse and touch events using `requestAnimationFrame` for buttery-smooth 60fps dragging without layout reflow.
    3. Add liquid glass handle pill with vertical glowing `Lavender` (`#D2C3F6`) laser divider ray and handle scale expansion (`scale 1.15`) on active drag.
  </action>
  <verify>npm run build</verify>
  <done>Comparison slider drags smoothly at 60fps with vertical laser ray divider</done>
</task>

<task type="auto">
  <name>Add Zoom Lens (100%/200%/400%) & Mouse Pan Controls</name>
  <files>src/components/ComparisonSlider.tsx</files>
  <action>
    1. Implement `zoomLevel` state (`1x`, `2x`, `4x`) applying `transform: scale() translate()` GPU compositing.
    2. Add mouse drag-to-pan support when zoomed in beyond 1x.
    3. Add glass pill controls with Phosphor icons (`MagnifyingGlassPlus`, `MagnifyingGlassMinus`, `ArrowsOut`) for instant zoom toggling.
  </action>
  <verify>npm run build</verify>
  <done>Zoom lens enables 100%, 200%, and 400% texture inspection with drag-to-pan support</done>
</task>

## Success Criteria
- [ ] `npm run build` succeeds with 0 errors
- [ ] Split slider drags hardware-accelerated at 60fps
- [ ] Zoom controls toggle between 1x, 2x, and 4x zoom levels
