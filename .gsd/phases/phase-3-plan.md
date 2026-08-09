# Phase 3 Plan: Add Refactor Safety Tests

> **Milestone**: `Refactor Modularization Quality Gate`
> **Phase**: Phase 3 — Add refactor safety tests
> **Objective**: Build isolated unit test protection around pure job lifecycle state, output path construction, and backend event normalization before modifying application components.

---

## Tasks

### Task 3.1: Extract and test pure job state lifecycle helpers
- **Target Files**: `src/lib/jobState.ts` (new), `src/lib/__tests__/jobState.test.ts` (new), `src/lib/types.ts`
- **Actions**:
  - Isolate `normalizeJobStatus`, `isTerminalState`, and `isValidStateTransition` into `src/lib/jobState.ts`.
  - Add comprehensive Vitest unit tests in `src/lib/__tests__/jobState.test.ts`.
  - Re-export helpers from `src/lib/types.ts` for full backwards compatibility.
- **Verification Commands**:
  - `npm.cmd run test`
  - `npm.cmd run check:ts`

### Task 3.2: Extract and test output path reservation mapping
- **Target Files**: `src/lib/outputPaths.ts` (new), `src/lib/__tests__/outputPaths.test.ts` (new)
- **Actions**:
  - Implement `buildDefaultOutputPath` and per-job output path tracking helper in `src/lib/outputPaths.ts`.
  - Add Vitest unit tests in `src/lib/__tests__/outputPaths.test.ts` covering path suffixing, directory overrides, and backend path mapping.
- **Verification Commands**:
  - `npm.cmd run test`
  - `npm.cmd run check:ts`

---

## Acceptance Gate Checklist (Phase 3)
- [ ] `src/lib/jobState.ts` created and unit-tested.
- [ ] `src/lib/outputPaths.ts` created and unit-tested.
- [ ] `npm.cmd run test` passes with all new tests.
- [ ] `npm.cmd run check:ts` passes cleanly.
- [ ] `npm.cmd run format:check:all` passes cleanly.
