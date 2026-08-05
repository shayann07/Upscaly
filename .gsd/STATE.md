# GSD Application State

> **Project**: Upscaly
> **Status**: Phase 1 Planned ⬜

## Current Position
- **Milestone**: `v2.0-win-gpu-reliability`
- **Phase**: Phase 1: Establish regression and benchmark evidence first
- **Status**: Phase 1 planned and ready for execution

## Last Session Summary
Defined Phase 1 execution plan in `.gsd/phases/phase-1-plan.md`.
- **Reference Corpus & Manifest**: Specified 1080p/12MP/24MP image & 1080p/4K video test corpus with decoded RGBA pixel hashing.
- **Benchmark Runner**: Specified `npm.cmd run benchmark` Node script recording device fingerprint, sidecar version, throughput, and output checks.
- **ProcessRunner Abstraction**: Designed Rust `ProcessRunner` trait with `StdProcessRunner` and `MockProcessRunner` for GPU-less testing.
- **Frontend Test Repairs**: Planned fixes for Vitest UI text mismatches (`Photo`, `Anime`, `2×`) and addition of `JobStateLifecycle.test.tsx`.

## Next Steps
- Execute Phase 1 tasks:
  1. Setup reference corpus and manifest.
  2. Implement `scripts/benchmark.ts` & decoded RGBA pixel hasher.
  3. Implement Rust `ProcessRunner` trait & `MockProcessRunner`.
  4. Fix Vitest suite & add job state lifecycle tests.
