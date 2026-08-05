---
phase: 5
plan: 2
wave: 2
---

# Plan 5.2: React UI Unit Test Suite & Unified CI Test Script

## Objective
Install Vitest and React Testing Library, write unit tests for core React components (`Titlebar`, `SettingsPanel`, `ComparisonSlider`, `ProgressOverlay`), and configure a unified test script (`npm run test`).

## Context
- `.gsd/SPEC.md`
- `.gsd/ARCHITECTURE.md`
- `.gsd/phases/5/RESEARCH.md`
- `package.json`
- `vitest.config.ts`
- `src/components/__tests__/Titlebar.test.tsx`
- `src/components/__tests__/SettingsPanel.test.tsx`
- `src/components/__tests__/ComparisonSlider.test.tsx`

## Tasks

<task type="auto">
  <name>Install Vitest, React Testing Library & setup Vitest config</name>
  <files>package.json, vitest.config.ts, src/components/__tests__/Titlebar.test.tsx, src/components/__tests__/SettingsPanel.test.tsx</files>
  <action>
    1. Install `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, and `jsdom` via npm.
    2. Create `vitest.config.ts` configuring JSDOM environment and global setup.
    3. Write `src/components/__tests__/Titlebar.test.tsx` testing title text and sound mute button toggle.
    4. Write `src/components/__tests__/SettingsPanel.test.tsx` testing category tab switching and scale button selection (`2x`/`3x`/`4x`).
  </action>
  <verify>npm run test</verify>
  <done>Vitest executes and passes Titlebar and SettingsPanel component tests</done>
</task>

<task type="auto">
  <name>Build ComparisonSlider & ProgressOverlay tests and unified test script</name>
  <files>src/components/__tests__/ComparisonSlider.test.tsx, src/components/__tests__/ProgressOverlay.test.tsx, package.json</files>
  <action>
    1. Write `src/components/__tests__/ComparisonSlider.test.tsx` testing zoom level toggles (`1x` → `2x` → `4x`).
    2. Write `src/components/__tests__/ProgressOverlay.test.tsx` testing percentage display and cancel button click.
    3. Add unified test script to `package.json`: `"test": "vitest run"`.
  </action>
  <verify>npm run test</verify>
  <done>Full frontend test suite passes cleanly with Vitest</done>
</task>

## Success Criteria
- [ ] `npm run test` executes all component unit tests with 0 failures
- [ ] Titlebar, SettingsPanel, ComparisonSlider, and ProgressOverlay have dedicated unit tests
- [ ] All tests pass cleanly in headless CI environment
