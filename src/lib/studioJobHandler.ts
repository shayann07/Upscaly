import { JobProgress, SUPPORTED_MODELS } from './types';
import { addHistoryItem, HistoryItem } from './history';
import { playCompleteSound, playErrorSound } from './sound';
import { allowMediaPath } from './assetScope';

export interface JobInputSnapshot {
  filePath: string;
  fileName: string;
  isVideo: boolean;
}

export interface StudioJobState {
  activeJobId: string | null;
  activeJobIdRef: React.MutableRefObject<string | null>;
  // Keyed by job id, captured when each job was *started*. Used instead of
  // the live filePath/fileName/isVideo below when a job's completion event
  // arrives, so re-selecting a different file while a job is still running
  // can no longer pair the new file's name with the old job's output.
  jobSnapshotsRef: React.MutableRefObject<Map<string, JobInputSnapshot>>;
  pendingOutputPath: React.MutableRefObject<string>;
  jobStartTimeRef?: React.MutableRefObject<number | null>;
  currentFileDims?: { w: number; h: number } | null;
  upscaledPath: string;
  selectedModel: string;
  fileName: string;
  filePath: string;
  scale: number;
  isVideo: boolean;
  isMuted: boolean;
  setActiveJobId: (id: string | null) => void;
  setProgressVal: (val: number) => void;
  setJobStatus: (status: string) => void;
  setJobPhase: (phase: string) => void;
  setEtaSeconds: (eta: number) => void;
  setFps: (fps: number) => void;
  setRateStr?: (rate: string) => void;
  setStatusMessage: (msg: string) => void;
  setUpscaledPath: (path: string) => void;
  setHistoryItems: React.Dispatch<React.SetStateAction<HistoryItem[]>>;
  refreshInstalledModels: () => void;
  onNotify: (
    type: 'success' | 'error' | 'info' | 'warning',
    title: string,
    message: string
  ) => void;
}

function handleCompletedStatus(
  eventOutPath: string | undefined,
  state: StudioJobState,
  snapshot: JobInputSnapshot,
  isActiveJob: boolean
) {
  const finalPath = eventOutPath || state.pendingOutputPath.current || state.upscaledPath;
  if (finalPath) {
    allowMediaPath(finalPath);
    // Matches the same lookup useStudioActions/useBatchSetup use when
    // writing their own history entries, instead of a second hardcoded
    // catalog (lib/models.ts) with different display names for the same
    // model ids -- history entries from different job paths previously
    // could end up with inconsistent modelName strings for the same model.
    const meta = SUPPORTED_MODELS.find((m) => m.id === state.selectedModel) || SUPPORTED_MODELS[0];
    const newHist = addHistoryItem({
      fileName: snapshot.fileName,
      originalPath: snapshot.filePath,
      upscaledPath: finalPath,
      modelName: meta.name,
      scale: state.scale,
      isVideo: snapshot.isVideo,
    });
    state.setHistoryItems(newHist);

    if (isActiveJob) {
      state.setStatusMessage('Upscaling Completed Successfully!');
      state.setUpscaledPath(finalPath);
    }
  }

  if (isActiveJob) {
    state.activeJobIdRef.current = null;
    state.setActiveJobId(null);
    playCompleteSound(state.isMuted);
    state.onNotify('success', 'Upscaling Complete', 'Enhanced output saved.');
  } else {
    // A different file is now on screen than the one this job was run on
    // (it was superseded by a newer selection/job before finishing). The
    // history entry above is still correct; just don't touch what the
    // user is currently looking at.
    state.onNotify(
      'success',
      'Background Job Complete',
      `${snapshot.fileName} finished upscaling.`
    );
  }
  state.refreshInstalledModels();
}

function handleFailedStatus(
  error: string | undefined,
  state: StudioJobState,
  snapshot: JobInputSnapshot,
  isActiveJob: boolean
) {
  const errStr = error || 'Processing failed during sidecar execution.';
  if (isActiveJob) {
    state.activeJobIdRef.current = null;
    state.setActiveJobId(null);
    state.setJobStatus('idle');
    playErrorSound(state.isMuted);
    state.onNotify('error', 'Upscaling Failed', errStr);
  } else {
    state.onNotify('error', 'Background Job Failed', `${snapshot.fileName}: ${errStr}`);
  }
}

function handleCancelledStatus(state: StudioJobState, isActiveJob: boolean) {
  if (isActiveJob) {
    state.activeJobIdRef.current = null;
    state.setActiveJobId(null);
    state.setJobStatus('idle');
    state.onNotify('info', 'Cancelled', 'Upscaling task was cancelled.');
  }
}

export function handleStudioJobStatus(progress: JobProgress, state: StudioJobState) {
  const {
    job_id,
    percentage,
    status,
    error,
    phase,
    eta_seconds,
    fps: jobFps,
    output_path: eventOutPath,
  } = progress;

  // Only react to jobs this hook actually started (snapshotted at launch).
  // This replaces a naive "does job_id match the currently active id"
  // check, which broke as soon as the user opened a different file (or
  // started a second job) while the first was still running: the stale
  // job's later events would still match and overwrite the new file's
  // view with the old job's result.
  const snapshot = state.jobSnapshotsRef.current.get(job_id);
  if (!snapshot) return;

  // "Active" means both: this is still the id the Cancel button/progress
  // bar are wired to, AND the file currently on screen is still the one
  // this job was started on. The second check is what catches the file
  // being re-selected (or cleared) without a new job being started yet --
  // activeJobIdRef is untouched by that, but the live view has moved on.
  const isActiveJob =
    state.activeJobIdRef.current === job_id &&
    snapshot.filePath === state.filePath &&
    snapshot.fileName === state.fileName;

  if (isActiveJob && state.activeJobId !== job_id) {
    state.setActiveJobId(job_id);
  }

  const isDone = status === 'succeeded' || status === 'completed';
  const isErr = status === 'failed';
  const isCancelled = status === 'cancelled';
  const isTerminal = isDone || isErr || isCancelled;
  const isProc = status === 'running' || status === 'processing';

  if (isTerminal) {
    state.jobSnapshotsRef.current.delete(job_id);
  }

  // Live progress-bar/ETA/status mutations only make sense for the job
  // that's actually driving the visible UI right now.
  if (isActiveJob) {
    const effectiveStatus = isDone ? 'completed' : isProc ? 'processing' : status;
    state.setProgressVal(percentage);
    state.setJobStatus(effectiveStatus);
    if (phase) state.setJobPhase(phase);

    if (eta_seconds !== undefined && eta_seconds > 0) {
      state.setEtaSeconds(eta_seconds);
    } else if (state.jobStartTimeRef?.current && percentage >= 15) {
      const elapsedSec = (Date.now() - state.jobStartTimeRef.current) / 1000;
      if (elapsedSec >= 2.0) {
        const pctPerSec = percentage / elapsedSec;
        const remPct = Math.max(0, 100 - percentage);
        const calcEta = Math.max(1, Math.ceil(remPct / Math.max(0.1, pctPerSec)));
        state.setEtaSeconds(calcEta);
      }
    }

    if (jobFps !== undefined && jobFps > 0) {
      state.setFps(jobFps);
      if (state.setRateStr) {
        state.setRateStr(`${jobFps.toFixed(1)} FPS`);
      }
    } else if (!state.isVideo && state.setRateStr && percentage >= 5) {
      const startTime = state.jobStartTimeRef?.current;
      if (startTime) {
        const elapsedSec = Math.max(0.3, (Date.now() - startTime) / 1000);
        const w = state.currentFileDims?.w || 1920;
        const h = state.currentFileDims?.h || 1080;
        const scale = state.scale || 4;
        const totalMp = (w * h * scale) / 1_000_000;
        const processedMp = totalMp * (percentage / 100);
        const mps = Math.max(0.1, processedMp / elapsedSec);
        state.setRateStr(`${mps.toFixed(1)} MP/s`);
      }
    }

    if (isProc) {
      state.setStatusMessage(phase || `Upscaling in progress... ${percentage.toFixed(1)}%`);
    } else if (status === 'queued') {
      state.setStatusMessage('Queued in GPU worker thread...');
    }
  }

  if (isDone) {
    handleCompletedStatus(eventOutPath, state, snapshot, isActiveJob);
  } else if (isErr) {
    handleFailedStatus(error, state, snapshot, isActiveJob);
  } else if (isCancelled) {
    handleCancelledStatus(state, isActiveJob);
  }
}
