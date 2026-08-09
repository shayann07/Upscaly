---
phase: 6
level: 0
researched_at: 2026-08-09
---

# Phase 6 Research: Split Large Frontend Components

## Questions Investigated

1. **How should `BatchQueueView` (302 lines, complexity 42) be decomposed?**
   - **Findings**: `BatchQueueView` handles rendering the header/action bar, queue summary statistics, item table/rows, and drag-and-drop file reordering.
   - **Recommendation**: Extract `BatchQueueHeader` (actions & stats summary) and `BatchQueueRow` (individual batch item row with progress/actions). Keep `BatchQueueView` as a thin container orchestrator under 120 lines and complexity under 15.

2. **How should `ComparisonSlider` (306 lines, complexity 24) be decomposed?**
   - **Findings**: `ComparisonSlider` handles canvas/viewport dragging, image zoom/pan math, split vs side-by-side mode rendering, and overlay controls.
   - **Recommendation**: Extract drag/pan state management into custom hook `useComparisonDrag.ts`. Extract toolbar controls into `ComparisonToolbar.tsx` and viewport canvas rendering into `ComparisonViewport.tsx`. Reduce `ComparisonSlider` function length below 100 lines and complexity below 10.

3. **How should `Titlebar` (238 lines, complexity 51) be decomposed?**
   - **Findings**: `Titlebar` contains window dragging/controls (minimize, maximize, close), navigation tab buttons, model selector button, and update badge.
   - **Recommendation**: Extract `WindowControls.tsx` (minimize/maximize/close handlers) and `TitlebarNav.tsx` (navigation tab buttons). Keep `Titlebar` focused on overall header layout.

4. **How should `SettingsPanel` (222 lines, complexity 41) and `AdvancedSettings` (227 lines, complexity 21) be decomposed?**
   - **Findings**: `SettingsPanel` manages general preferences (GPU selection, tile size, scale factor, output folder). `AdvancedSettings` manages performance tuning, sound effects, and diagnostic exports.
   - **Recommendation**: Extract `GpuSelectorSection.tsx` and `OutputFolderSection.tsx` from `SettingsPanel`. Extract `TunerSection.tsx` from `AdvancedSettings`.

5. **How should the remaining warnings in `App.tsx` (838 lines, complexity 37, handlers complexity 22 & 26) be resolved?**
   - **Findings**: Handlers inside `App.tsx` (keyboard shortcuts handler and single-job status handler) exceed cognitive complexity (22 and 26).
   - **Recommendation**: Decompose keyboard shortcut handling into a dedicated `useKeyboardShortcuts` hook or sub-handler function, and extract `handleStudioJobProgress` into a helper module/hook to bring `App.tsx` functions well under max-lines (150) and complexity (20).

## Decisions Made

| Component | Sub-components / Hooks to Extract | Target Function Length & Complexity |
|-----------|----------------------------------|------------------------------------|
| `BatchQueueView.tsx` | `BatchQueueHeader.tsx`, `BatchQueueRow.tsx` | < 120 lines, complexity < 15 |
| `ComparisonSlider.tsx` | `useComparisonDrag.ts`, `ComparisonToolbar.tsx`, `ComparisonViewport.tsx` | < 100 lines, complexity < 10 |
| `Titlebar.tsx` | `WindowControls.tsx`, `TitlebarNav.tsx` | < 100 lines, complexity < 15 |
| `SettingsPanel.tsx` | `GpuSelectorSection.tsx`, `OutputFolderSection.tsx` | < 120 lines, complexity < 15 |
| `AdvancedSettings.tsx` | `TunerSection.tsx` | < 120 lines, complexity < 15 |
| `App.tsx` | `useKeyboardShortcuts.ts`, `handleStudioProgress.ts` | < 150 lines, complexity < 20 |

## Patterns to Follow
- Presentational sub-components accept typed props and callbacks.
- Custom hooks encapsulate DOM event listeners (mouse drag, keyboard shortcuts).
- All component exports match existing export signatures so no external call-site changes are required.

## Anti-Patterns to Avoid
- Do NOT disable ESLint rules or modify `.eslintrc.cjs` thresholds.
- Do NOT introduce prop-drilling beyond 1 level; keep parent-child relationships shallow.
- Do NOT alter visual styling, Framer Motion animations, or CSS classes.

## Ready for Planning
- [x] All 15 ESLint warnings identified and target components mapped.
- [x] Sub-components and custom hooks structured.
- [x] Verification strategy confirmed (`check:ts`, `test`, `lint:ts`, `build`).
