---
phase: 6
plan: 1
wave: 1
---

# Plan 6.1: Refactor & Split BatchQueueView and ComparisonSlider

## Objective
Decompose `BatchQueueView` and `ComparisonSlider` into presentational sub-components and dedicated hooks, reducing function length under 150 lines and cognitive complexity under 20 for both components.

## Context
- .gsd/SPEC.md
- .gsd/phases/6/RESEARCH.md
- src/components/BatchQueueView.tsx
- src/components/ComparisonSlider.tsx

## Tasks

<task type="auto">
  <name>Task 6.1.1: Decompose BatchQueueView into sub-components</name>
  <files>src/components/BatchQueueView.tsx, src/components/batch/BatchQueueHeader.tsx, src/components/batch/BatchQueueRow.tsx</files>
  <action>
    - Create `src/components/batch/BatchQueueHeader.tsx` to render queue header stats, batch action buttons, and clear buttons.
    - Create `src/components/batch/BatchQueueRow.tsx` to render individual batch item rows, progress bars, status badges, and action buttons.
    - Refactor `BatchQueueView.tsx` to use `BatchQueueHeader` and `BatchQueueRow`.
    - Ensure `BatchQueueView` function line count is under 150 lines and cognitive complexity is under 20.
  </action>
  <verify>npm.cmd run check:ts && npm.cmd run test</verify>
  <done>BatchQueueView ESLint max-lines and complexity warnings eliminated cleanly.</done>
</task>

<task type="auto">
  <name>Task 6.1.2: Decompose ComparisonSlider into hook and sub-components</name>
  <files>src/components/ComparisonSlider.tsx, src/hooks/useComparisonDrag.ts, src/components/comparison/ComparisonToolbar.tsx, src/components/comparison/ComparisonViewport.tsx</files>
  <action>
    - Create `src/hooks/useComparisonDrag.ts` to manage slider position, zoom level, pan position, and drag event handlers.
    - Create `src/components/comparison/ComparisonToolbar.tsx` for view mode buttons, zoom reset, and display controls.
    - Create `src/components/comparison/ComparisonViewport.tsx` for split/side-by-side canvas rendering.
    - Refactor `ComparisonSlider.tsx` to integrate the hook and sub-components.
    - Ensure `ComparisonSlider` function line count is under 150 lines and cognitive complexity is under 20.
  </action>
  <verify>npm.cmd run check:ts && npm.cmd run test</verify>
  <done>ComparisonSlider ESLint max-lines and complexity warnings eliminated cleanly.</done>
</task>

## Success Criteria
- [ ] `BatchQueueView.tsx` function length < 150 lines and complexity < 20.
- [ ] `ComparisonSlider.tsx` function length < 150 lines and complexity < 20.
- [ ] All unit tests pass cleanly.
