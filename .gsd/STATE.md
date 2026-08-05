# GSD Application State

> **Project**: Upscaly
> **Status**: Phase 2 Planned ⬜

## Current Position
- **Milestone**: `v2.0-win-gpu-reliability`
- **Phase**: Phase 2: Replace the Queue with a Cancellable, Race-Free Job Runtime
- **Status**: Phase 2 planned and ready for execution

## Last Session Summary
Defined Phase 2 execution plan in `.gsd/phases/phase-2-plan.md`.
- **Public Command Contract**: Client-generated `job_id` (`crypto.randomUUID()`), strict terminal event contract (`queued | running | succeeded | failed | cancelled`).
- **Backend Scheduler**: `VecDeque<Job>` with `ActiveJobRegistry`, atomic `JobControl`, concurrent stdout/stderr stream drain, and non-blocking polling.
- **Safe Video Cleanup**: Frame monitor loop with explicit exit conditions (frame completion, sidecar exit, cancellation, or phase failure).
- **Output-Path Reservation**: Backend path reservation preventing filename collisions (`_upscaled_4x (1)`).
- **Frontend State**: Event-driven job reducer in `App.tsx` handling single and batch job states.

## Next Steps
- Run `/execute 2` to execute Phase 2 tasks.
