import { JobProgress } from './types';
import { getModelMetadata } from './models';
import { addHistoryItem, HistoryItem } from './history';
import { playCompleteSound, playErrorSound } from './sound';

export interface StudioJobState {
  activeJobId: string | null;
  activeJobIdRef: React.MutableRefObject<string | null>;
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

function handleCompletedStatus(eventOutPath: string | undefined, state: StudioJobState) {
  state.setStatusMessage('Upscaling Completed Successfully!');
  const finalPath = eventOutPath || state.pendingOutputPath.current || state.upscaledPath;
  if (finalPath) {
    state.setUpscaledPath(finalPath);
    const meta = getModelMetadata(state.selectedModel);
    const newHist = addHistoryItem({
      fileName: state.fileName,
      originalPath: state.filePath,
      upscaledPath: finalPath,
      modelName: meta.name,
      scale: state.scale,
      isVideo: state.isVideo,
    });
    state.setHistoryItems(newHist);
  }
  state.activeJobIdRef.current = null;
  state.setActiveJobId(null);
  state.refreshInstalledModels();
  playCompleteSound(state.isMuted);
  state.onNotify('success', 'Upscaling Complete', 'Enhanced output saved.');
}

function handleFailedStatus(error: string | undefined, state: StudioJobState) {
  state.activeJobIdRef.current = null;
  state.setActiveJobId(null);
  state.setJobStatus('idle');
  playErrorSound(state.isMuted);
  const errStr = error || 'Processing failed during sidecar execution.';
  state.onNotify('error', 'Upscaling Failed', errStr);
}

function handleCancelledStatus(state: StudioJobState) {
  state.activeJobIdRef.current = null;
  state.setActiveJobId(null);
  state.setJobStatus('idle');
  state.onNotify('info', 'Cancelled', 'Upscaling task was cancelled.');
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

  const isCurrentStudioJob =
    (state.activeJobId && job_id === state.activeJobId) ||
    (state.activeJobIdRef.current && job_id === state.activeJobIdRef.current);

  if (!isCurrentStudioJob) return;

  if (state.activeJobIdRef.current !== job_id) {
    state.activeJobIdRef.current = job_id;
    state.setActiveJobId(job_id);
  }

  const isDone = status === 'succeeded' || status === 'completed';
  const isProc = status === 'running' || status === 'processing';
  const effectiveStatus = isDone ? 'completed' : isProc ? 'processing' : status;

  state.setProgressVal(percentage);
  state.setJobStatus(effectiveStatus);
  if (phase) state.setJobPhase(phase);

  if (eta_seconds !== undefined && eta_seconds > 0) {
    state.setEtaSeconds(eta_seconds);
  } else if (state.jobStartTimeRef?.current && percentage > 0 && (!state.isVideo || percentage >= 10)) {
    const elapsedSec = (Date.now() - state.jobStartTimeRef.current) / 1000;
    if (elapsedSec > 0.5) {
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
  } else if (state.jobStartTimeRef?.current && percentage > 0 && state.setRateStr) {
    const elapsedSec = Math.max(0.1, (Date.now() - state.jobStartTimeRef.current) / 1000);
    let totalMp = 12.0;
    if (state.currentFileDims && state.currentFileDims.w && state.currentFileDims.h) {
      totalMp = (state.currentFileDims.w * state.currentFileDims.h * state.scale) / 1_000_000;
    }
    const processedMp = totalMp * (percentage / 100);
    const mps = Math.max(0.5, processedMp / elapsedSec);
    state.setRateStr(`${mps.toFixed(1)} MP/s`);
  }

  if (isProc) {
    state.setStatusMessage(`Upscaling in progress... ${percentage.toFixed(1)}%`);
  } else if (status === 'queued') {
    state.setStatusMessage('Queued in GPU worker thread...');
  } else if (isDone) {
    handleCompletedStatus(eventOutPath, state);
  } else if (status === 'failed') {
    handleFailedStatus(error, state);
  } else if (status === 'cancelled') {
    handleCancelledStatus(state);
  }
}
