---
phase: 5
level: 2
researched_at: 2026-08-03
---

# Phase 5 Research: Comprehensive Automated Testing Suite

## Questions Investigated

1. **Rust Backend Unit Testing**: How to test `AppError` IPC serialization, `sidecar_manager` path resolution, `model_manager` SHA-256 calculation, and `settings.json` load/save in Rust?
2. **React Component Testing with Vitest**: How to configure `vitest` + `@testing-library/react` + `@testing-library/jest-dom` for testing React 19 UI components?
3. **Tauri IPC Mocking**: How to mock `@tauri-apps/api/core` (`invoke`) and `@tauri-apps/api/event` (`listen`) in component unit tests?
4. **End-to-End Test Execution Script**: How to run `cargo test` and `npm run test` as a unified CI/CD verification script?

---

## Findings

### 1. Rust Unit Testing (`src-tauri/src/tests.rs`)
- **Unit Tests**:
  - `test_app_error_serialization`: Asserts `AppError::SidecarNotFound` serializes to `{ "code": "SIDECAR_NOT_FOUND", ... }`.
  - `test_sha256_calculation`: Verifies `model_manager::calculate_sha256` against known test string hash.
  - `test_settings_serialization`: Verifies `AppSettings` default values and JSON round-trip serialization.

### 2. React UI Unit Testing (Vitest + React Testing Library)
- **Dependencies**: `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`.
- **Component Tests**:
  - `Titlebar.test.tsx`: Tests status badge rendering and window control button clicks.
  - `SettingsPanel.test.tsx`: Tests category tab switching and resolution scale selection (`2x`, `3x`, `4x`).
  - `ComparisonSlider.test.tsx`: Tests zoom lens level state changes (`1x` → `2x` → `4x`).

### 3. Tauri IPC Mocking
- **Mock Setup**: Use `vi.mock('@tauri-apps/api/core')` and `vi.mock('@tauri-apps/plugin-opener')` in test helpers.

---

## Decisions Made

| Testing Scope | Framework / Tool | Rationale |
|---------------|------------------|-----------|
| Rust Backend | Built-in `cargo test` | Zero extra dependencies, native Rust test framework. |
| React Frontend | `vitest` + `@testing-library/react` | Lightning-fast Vite native test runner with JSDOM environment. |
| IPC Mocking | Vitest `vi.mock()` | Isolates frontend components from desktop Tauri runtime during testing. |

---

## Ready for Planning
- [x] Rust backend test suite structure defined
- [x] Vitest + React Testing Library setup mapped
- [x] Tauri IPC mocking approach verified
