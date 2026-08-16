# Phase 5 Plan: Replace Batch Polling with Event-Driven Queue State

## Objective
Eliminate interval polling in batch upscaling in favor of a reducer-driven queue state machine (`useUpscaleQueue`), extract job IPC event listening into `useJobEvents`, and treat backend event `output_path` as authoritative.

## Context
- `docs/REFACTORING_PLAN.md` (Finding A2)
- `.gsd/ROADMAP.md` (Phase 5)
- `src/App.tsx`

## Tasks

### Task 5.1: Extract Tauri job event listener hook
- **Files**: `src/hooks/useJobEvents.ts` (new), `src/hooks/__tests__/useJobEvents.test.ts` (new), `src/App.tsx`
- **Action**:
  - Implement `useJobEvents` encapsulating Tauri `listen<JobProgress>('job-status-changed', ...)` subscription and cleanup.
  - Test listener setup and teardown behavior with Vitest.
- **Verification**: `npm.cmd run check:ts`, `npm.cmd run test`.
- **Done Criteria**: `useJobEvents` is fully unit-tested and handles event subscription/unsubscription without memory leaks.

### Task 5.2: Replace batch polling with reducer-driven queue state
- **Files**: `src/hooks/useUpscaleQueue.ts` (new), `src/hooks/__tests__/useUpscaleQueue.test.ts` (new), `src/App.tsx`
- **Action**:
  - Implement `useUpscaleQueue` state reducer managing `batchItems` and batch upscaling execution.
  - Remove `setInterval` 300ms polling from `handleStartBatchUpscale` in `App.tsx`.
  - Use `output_path` from backend `'job-status-changed'` payload as authoritative destination path.
  - Test queue state reducer transitions, terminal event handling, and batch item state updates.
- **Verification**: `npm.cmd run check:ts`, `npm.cmd run test`, `npm.cmd run lint:ts`, `npm.cmd run build`.
- **Done Criteria**: All unit tests pass, `npm run build` succeeds, and batch upscaling uses zero `setInterval` loops.

## Success Criteria
- [ ] `useJobEvents` and `useUpscaleQueue` custom hooks implemented and unit tested.
- [ ] Zero `setInterval` polling in `src/App.tsx`.
- [ ] Backend event `output_path` treated as authoritative source of truth.
- [ ] `npm run check:ts`, `npm run test`, `npm run build`, and `npm run format:check:all` pass 100% cleanly.
