import { JobSnapshot } from '../lib/ipc';
import { JobState, isValidStateTransition, normalizeJobStatus } from '../lib/jobState';

/**
 * One row of the queue, and the only model of a job the frontend has.
 *
 * There used to be three overlapping ones: a `BatchItem` list, a set of
 * loose `jobStatus`/`progressVal`/`jobPhase` variables for whichever job the
 * studio view was showing, and a `Map` of input snapshots captured at launch
 * so a completion event could be paired back to the file it belonged to.
 * They were rebuilt independently from the same event stream and drifted.
 *
 * Every field the backend owns is written only by [`mergeSnapshot`]. The
 * frontend fills in what the backend has no opinion about (the source
 * dimensions it probed for the preview) and nothing else.
 */
export interface QueueItem {
  id: string;
  filePath: string;
  fileName: string;
  isVideo: boolean;
  /** Source dimensions, or `null` while unprobed / unprobeable. */
  w: number | null;
  h: number | null;
  status: JobState;
  progress: number;
  phase: string | null;
  etaSeconds: number | null;
  fps: number | null;
  /** Where the backend reserved this job's output. It owns the naming. */
  outputPath: string | null;
  error: string | null;
  /** The model the backend actually ran, once it has run. */
  modelName: string | null;
  scale: number | null;
  startedAtMs: number | null;
  finishedAtMs: number | null;
}

export interface StagedFile {
  id: string;
  filePath: string;
  fileName: string;
  isVideo: boolean;
  w: number | null;
  h: number | null;
}

/** A freshly picked file: present in the queue, not yet submitted. */
export function stagedItem(file: StagedFile): QueueItem {
  return {
    ...file,
    status: 'ready',
    progress: 0,
    phase: null,
    etaSeconds: null,
    fps: null,
    outputPath: null,
    error: null,
    modelName: null,
    scale: null,
    startedAtMs: null,
    finishedAtMs: null,
  };
}

/**
 * Builds a row for a job the backend knows about but this session never
 * staged -- what a snapshot taken after a reload returns.
 */
export function itemFromSnapshot(snapshot: JobSnapshot): QueueItem {
  return applySnapshotFields(
    {
      id: snapshot.job_id,
      filePath: snapshot.input_path,
      fileName: snapshot.file_name,
      isVideo: snapshot.is_video,
      w: null,
      h: null,
      status: 'queued',
      progress: 0,
      phase: null,
      etaSeconds: null,
      fps: null,
      outputPath: null,
      error: null,
      modelName: null,
      scale: null,
      startedAtMs: null,
      finishedAtMs: null,
    },
    snapshot
  );
}

function applySnapshotFields(item: QueueItem, snapshot: JobSnapshot): QueueItem {
  return {
    ...item,
    status: normalizeJobStatus(snapshot.status),
    progress: snapshot.percentage,
    phase: snapshot.phase,
    etaSeconds: snapshot.eta_seconds,
    fps: snapshot.fps,
    outputPath: snapshot.output_path,
    error: snapshot.error,
    modelName: snapshot.model_name,
    scale: snapshot.scale,
    isVideo: snapshot.is_video,
    startedAtMs: snapshot.started_at_ms,
    finishedAtMs: snapshot.finished_at_ms,
  };
}

/**
 * Folds a backend snapshot into an existing row.
 *
 * Returns the row unchanged when the transition is not allowed. Both sides
 * enforce the same table, and both need to: the backend so a straggling tick
 * cannot revive a killed job, and this side because deltas can still be
 * delivered out of order across the IPC boundary, and applying a stale one
 * would flip a finished row back to "running" with nothing behind it.
 */
export function mergeSnapshot(item: QueueItem, snapshot: JobSnapshot): QueueItem {
  const next = normalizeJobStatus(snapshot.status);
  if (!isValidStateTransition(item.status, next)) {
    return item;
  }
  return applySnapshotFields(item, snapshot);
}
