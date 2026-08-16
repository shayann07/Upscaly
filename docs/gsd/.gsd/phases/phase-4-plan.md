# Phase 4 Plan: Extract Frontend Settings, Model Catalog, and Media Selection Hooks

> **Milestone**: `Refactor Modularization Quality Gate`
> **Phase**: Phase 4 — Extract frontend settings, model catalog, and media selection hooks
> **Objective**: Decompose `src/App.tsx` state management by extracting settings persistence, model catalog status resolution, and media file/folder selection into focused custom hooks.

---

## Tasks

### Task 4.1: Extract settings state hook
- **Target Files**: `src/App.tsx`, `src/hooks/useSettings.ts` (new), `src/hooks/__tests__/useSettings.test.ts` (new)
- **Actions**:
  - Implement `useSettings` hook encapsulating GPU discovery, tile size selection, custom output path, and sound mute state.
  - Create Vitest test suite `src/hooks/__tests__/useSettings.test.ts`.
- **Verification Commands**:
  - `npm.cmd run check:ts`
  - `npm.cmd run test`

### Task 4.2: Extract model catalog state hook
- **Target Files**: `src/App.tsx`, `src/hooks/useModelCatalog.ts` (new), `src/hooks/__tests__/useModelCatalog.test.ts` (new)
- **Actions**:
  - Implement `useModelCatalog` hook encapsulating catalog discovery, installed models, selected model, download state, and repair actions.
  - Create Vitest test suite `src/hooks/__tests__/useModelCatalog.test.ts`.
- **Verification Commands**:
  - `npm.cmd run check:ts`
  - `npm.cmd run test`

### Task 4.3: Extract media selection state hook
- **Target Files**: `src/App.tsx`, `src/hooks/useMediaSelection.ts` (new), `src/hooks/__tests__/useMediaSelection.test.ts` (new)
- **Actions**:
  - Implement `useMediaSelection` hook encapsulating single file selection, folder batch ingestion, dimension probing, and batch item state.
  - Create Vitest test suite `src/hooks/__tests__/useMediaSelection.test.ts`.
- **Verification Commands**:
  - `npm.cmd run check:ts`
  - `npm.cmd run test`
  - `npm.cmd run build`

---

## Acceptance Gate Checklist (Phase 4)
- [ ] `useSettings.ts`, `useModelCatalog.ts`, and `useMediaSelection.ts` hooks created.
- [ ] Unit tests created for all 3 hooks in `src/hooks/__tests__/`.
- [ ] `App.tsx` state refactored to use extracted hooks.
- [ ] `npm.cmd run check:ts` passes cleanly.
- [ ] `npm.cmd run test` passes with all new hook tests.
- [ ] `npm.cmd run build` compiles production assets cleanly.
- [ ] `npm.cmd run format:check:all` passes cleanly.
