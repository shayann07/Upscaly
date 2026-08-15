import { JobSnapshot } from '../lib/types';

/**
 * Builds a `JobSnapshot` the way one actually arrives over IPC.
 *
 * `JobSnapshot` is generated from the Rust struct, where every optional
 * field is an explicit `null` rather than an absent key -- a distinction
 * that has already caused one real bug (a backend-supplied ETA silently
 * discarded because the check was `!== undefined`). Tests that hand-write
 * partial payloads reintroduce exactly that gap, so they all go through
 * here instead.
 */
export function jobSnapshot(over: Partial<JobSnapshot> & Pick<JobSnapshot, 'job_id'>): JobSnapshot {
  return {
    input_path: `C:/in/${over.job_id}.png`,
    output_path: `C:/out/${over.job_id}_upscaled_4x.png`,
    file_name: `${over.job_id}.png`,
    model_name: 'realesrgan-x4plus',
    gpu_id: 0,
    scale: 4,
    tile_size: 256,
    is_video: false,
    percentage: 0,
    status: 'queued',
    error: null,
    phase: null,
    eta_seconds: null,
    fps: null,
    queued_at_ms: 0,
    started_at_ms: null,
    finished_at_ms: null,
    ...over,
  };
}
