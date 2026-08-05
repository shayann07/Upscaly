# Phase 6 Execution Plan: Final Verification and Release Criteria

> **Milestone**: `v2.0-win-gpu-reliability`
> **Phase**: Phase 6 — Final verification and release criteria
> **Objective**: Execute complete verification matrix, confirm decoded RGBA pixel hash match against baseline manifest, verify zero hanging jobs/threads, confirm 100% test pass rate, and generate Phase 6 verification summary.

---

## 1. Automated & Empirical Verification Matrix

### Plan
- Run full Rust test suite: `cargo test` (must achieve 100% pass rate).
- Run full Vitest frontend suite: `npm.cmd run test` (must achieve 100% pass rate).
- Run benchmark runner: `npm.cmd run benchmark` (must generate valid decoded pixel hash report).
- Validate all 6 sections against user requirements.

---

## 2. Release Acceptance & Final Milestone Audit

### Plan
- Update `.gsd/ROADMAP.md` and `.gsd/STATE.md` marking milestone `v2.0-win-gpu-reliability` as 100% Complete.
- Create `.gsd/phases/phase-6-VERIFICATION.md` summarizing the full empirical evidence.

---

## Acceptance Gate Checklist (Phase 6)
- [ ] `cargo test` passes 100% (11/11 tests).
- [ ] `npm.cmd run test` passes 100% (17/17 tests).
- [ ] `npm.cmd run benchmark` passes cleanly with decoded pixel hashes.
- [ ] All 6 phases verified and marked Complete in `ROADMAP.md`.
