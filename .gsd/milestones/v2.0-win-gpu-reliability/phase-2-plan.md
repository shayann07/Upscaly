# Phase 2 Execution Plan: Replace the Queue with a Cancellable, Race-Free Job Runtime

> **Milestone**: `v2.0-win-gpu-reliability`
> **Phase**: Phase 2 — Replace the queue with a cancellable, race-free job runtime
> **Objective**: Implement client-generated `job_id`, strict terminal event states (`queued`, `running`, `succeeded`, `failed`, `cancelled`), `VecDeque` job queue with `ActiveJobRegistry`, non-hanging video monitor cleanup, backend output-path reservation, and React job reducer.

---

## 1. Public Command and Event Contract

### Plan
- Extend Rust IPC request struct `UpscaleRequest`:
  ```rust
  #[derive(Debug, serde::Deserialize)]
  pub struct UpscaleRequest {
      pub job_id: String,
      pub input_path: String,
      pub output_path: String,
      pub model_id: String,
      pub gpu_id: i32,
      pub scale: i32,
      pub tile_size: i32,
      pub is_video: bool,
  }
  ```
- Frontend creates `job_id` via `crypto.randomUUID()` before calling `run_upscale`.
- Backend validates uniqueness of `job_id` and returns the exact same ID.
- Standardize `JobProgress` terminal status events: `queued | running | succeeded | failed | cancelled`.
- Emit exactly one terminal event per job (`succeeded`, `failed`, or `cancelled`).
- Include `error` field only for `failed` status.

---

## 2. Backend Runtime Architecture & Active Job Registry

### Plan
- Refactor `src-tauri/src/job_queue.rs`:
  - Replace `Vec<Job>` with `VecDeque<Job>`.
  - Define `JobControl`:
    - `cancel_requested: Arc<AtomicBool>`
    - `child_handle: Option<Box<dyn ProcessHandle>>`
  - Maintain `ActiveJobRegistry` (`HashMap<String, JobControl>`) populated immediately after spawn, prior to reading output streams or reporting `running`.
  - Single worker thread processes `VecDeque<Job>` items sequentially.
  - Queued job cancellation: remove from `VecDeque` and emit `cancelled` event immediately.
  - Spawning job cancellation: retain cancel request; kill child immediately upon registry insertion and emit `cancelled`.
- Concurrent Piped Stream Drain:
  - Spawn threads to drain stdout and stderr concurrently into channels to prevent process blocking on OS pipe buffers.
  - Parse progress line-by-line without assuming stderr-only diagnostic stream.
- Output Verification:
  - Check that destination file exists and is non-empty before emitting `succeeded`.

---

## 3. Safe Video Frame Monitor Cleanup

### Plan
- Refactor `src-tauri/src/video_pipeline.rs`:
  - Pass atomic cancellation signal and completion channel to frame monitoring thread.
  - Frame monitor thread stops and joins when:
    - All expected frames are written.
    - Sidecar process exits.
    - Cancellation flag is set.
    - Extraction / upscaling / reassembly phase fails.
  - Eliminate deadlocks where monitor waits indefinitely for missing frame counts.

---

## 4. Backend Output Path Reservation

### Plan
- Implement output path reservation module:
  - In-process mutex tracking active reserved output file paths.
  - When a job is enqueued, check if destination exists on disk or is reserved by another job.
  - Generate deterministic suffix (`name_upscaled_4x (1).png` / `.mp4`) when collisions occur.
  - Use reserved final path in progress/completion events and history metadata.
  - Release reservation upon terminal job cleanup (`succeeded`, `failed`, `cancelled`).

---

## 5. Frontend State & Event-Driven Batch Reducer

### Plan
- Refactor `src/App.tsx` and batch state management:
  - Maintain separate `activeJobId` state from batch item IDs.
  - Implement state transition function enforcing valid transitions (`ready` → `queued` → `running` → `terminal`).
  - Register batch items before invoking backend; enqueue all batch jobs directly without 300ms polling loops.
  - Handle Cancel action: cancel active running item only while queued items remain in queue.
  - Mark batch complete only after every batch item reaches a terminal state (`succeeded`, `failed`, `cancelled`).
  - Preserve error details for display on failed items.

---

## Acceptance Gate Checklist (Phase 2)
- [ ] Client-generated `job_id` passed from frontend and echoed by backend.
- [ ] IPC events strictly emit terminal states (`queued`, `running`, `succeeded`, `failed`, `cancelled`).
- [ ] `VecDeque<Job>` worker with `ActiveJobRegistry` handles active and queued cancellations instantly.
- [ ] Video frame monitor terminates cleanly without hanging on cancellation or sidecar error.
- [ ] Backend path reservation prevents output file collisions (`_upscaled_4x (1)`).
- [ ] Frontend Vitest tests and Rust backend unit tests pass 100%.
