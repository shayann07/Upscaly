import { useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { playErrorSound } from '../lib/sound';
import { ModelInfo, BatchItem, HistoryEntry, UpscaleJobHandle } from '../lib/types';
import { allowMediaPath } from '../lib/assetScope';
import { JobInputSnapshot } from '../lib/studioJobHandler';
import { JobState } from '../lib/jobState';

interface StudioActionsOptions {
  filePath: string | null;
  fileName: string | null;
  isVideo: boolean;
  scale: number;
  selectedModel: string;
  selectedGpu: number;
  gpus?: { id: number; name: string }[];
  tileSize: number;
  customOutputPath: string;
  isMuted: boolean;
  batchItems: BatchItem[];
  handleStartBatchUpscale?: () => void;
  supportedModels: ModelInfo[];
  installedModels: string[];
  activeJobId: string | null;
  jobStatus?: JobState;
  confirmCancelOpen: boolean;
  setConfirmCancelOpen: (open: boolean) => void;
  setActiveJobId: (id: string | null) => void;
  setJobStatus: (status: JobState) => void;
  setProgressVal: (val: number) => void;
  setStatusMessage: (msg: string) => void;
  setJobPhase: (phase: string) => void;
  setEtaSeconds?: (eta: number | undefined) => void;
  setFps?: (fps: number | undefined) => void;
  setRateStr?: (rate: string) => void;
  setCategory: (cat: 'photos' | 'anime' | 'video') => void;
  setSelectedModel: (id: string) => void;
  setScale: (s: number) => void;
  setFilePath: (path: string) => void;
  setFileName: (name: string) => void;
  setUpscaledPath: (path: string) => void;
  setIsVideo: (isVid: boolean) => void;
  setCurrentFileDims: (dims: { w: number; h: number } | null) => void;
  setBatchItems: (items: BatchItem[] | ((prev: BatchItem[]) => BatchItem[])) => void;
  setActiveNavTab: (tab: 'models' | 'history' | 'settings' | 'about' | null) => void;
  onNotify: (
    type: 'success' | 'error' | 'info' | 'warning',
    title: string,
    message: string
  ) => void;
}

export function useStudioActions({
  filePath,
  fileName,
  isVideo,
  scale,
  selectedModel,
  selectedGpu,
  gpus,
  tileSize,
  customOutputPath,
  isMuted,
  batchItems,
  handleStartBatchUpscale,
  supportedModels,
  installedModels,
  activeJobId,
  jobStatus,
  confirmCancelOpen,
  setConfirmCancelOpen,
  setActiveJobId,
  setJobStatus,
  setProgressVal,
  setStatusMessage,
  setJobPhase,
  setEtaSeconds,
  setFps,
  setRateStr,
  setCategory,
  setSelectedModel,
  setScale,
  setFilePath,
  setFileName,
  setUpscaledPath,
  setIsVideo,
  setCurrentFileDims,
  setBatchItems,
  setActiveNavTab,
  onNotify,
}: StudioActionsOptions) {
  const pendingOutputPath = useRef<string>('');
  const activeJobIdRef = useRef<string | null>(null);
  const jobStartTimeRef = useRef<number | null>(null);
  // Snapshots the input (filePath/fileName/isVideo) that was active when
  // each job was *started*, keyed by job id. handleStudioJobStatus reads
  // from this -- not the live filePath/fileName -- when a job's completion
  // event arrives, so opening a different file while a job is still
  // running can no longer pair the new file's name with the old job's
  // output in history, or flip the UI to show that mismatched result.
  const jobSnapshotsRef = useRef<Map<string, JobInputSnapshot>>(new Map());

  const handleSelectCategory = useCallback(
    (cat: 'photos' | 'anime' | 'video') => {
      setCategory(cat);
      const targetCat = cat === 'photos' ? 'photo' : cat;
      const filtered = supportedModels.filter((m) => m.cat === targetCat);
      if (filtered.length > 0) {
        const scaleMatched = filtered.find((m) => m.scale === scale);
        const installedFiltered = filtered.filter((m) => installedModels.includes(m.id));
        const chosen =
          (scaleMatched &&
          (installedModels.length === 0 || installedModels.includes(scaleMatched.id))
            ? scaleMatched
            : null) ||
          scaleMatched ||
          (installedFiltered.length > 0 ? installedFiltered[0] : filtered[0]);
        setSelectedModel(chosen.id);
        if (chosen.scale) setScale(chosen.scale);
      }
    },
    [supportedModels, installedModels, scale, setCategory, setSelectedModel, setScale]
  );

  const handleSelectModel = useCallback(
    (modelId: string) => {
      setSelectedModel(modelId);
      const modelInfo = supportedModels.find((m) => m.id === modelId);
      if (modelInfo) {
        if (modelInfo.scale) setScale(modelInfo.scale);
        const modelCat =
          modelInfo.cat === 'photo' ? 'photos' : (modelInfo.cat as 'anime' | 'video');
        setCategory(modelCat);
      }
    },
    [supportedModels, setSelectedModel, setScale, setCategory]
  );

  const handleSelectScale = useCallback(
    (newScale: number) => {
      setScale(newScale);
      const currentModelInfo = supportedModels.find((m) => m.id === selectedModel);
      if (currentModelInfo && currentModelInfo.scale !== newScale) {
        const currentCat = currentModelInfo.cat;
        const matchingModel =
          supportedModels.find(
            (m) =>
              m.cat === currentCat &&
              m.scale === newScale &&
              (installedModels.length === 0 || installedModels.includes(m.id))
          ) ||
          supportedModels.find((m) => m.cat === currentCat && m.scale === newScale) ||
          supportedModels.find(
            (m) =>
              m.scale === newScale &&
              (installedModels.length === 0 || installedModels.includes(m.id))
          ) ||
          supportedModels.find((m) => m.scale === newScale);

        if (matchingModel) {
          setSelectedModel(matchingModel.id);
        }
      }
    },
    [supportedModels, selectedModel, installedModels, setScale, setSelectedModel]
  );

  const handleStartUpscale = async () => {
    setUpscaledPath('');
    if (batchItems && batchItems.length > 1 && handleStartBatchUpscale) {
      handleStartBatchUpscale();
      return;
    }
    if (gpus && gpus.length === 0) {
      onNotify(
        'error',
        'No Vulkan GPU Found',
        'No Vulkan-compatible GPU detected. Please install updated graphics display drivers.'
      );
      return;
    }
    if (!filePath || !fileName) {
      onNotify('warning', 'No File Selected', 'Please drag and drop or open an image/video first.');
      return;
    }
    try {
      const clientJobId = crypto.randomUUID();
      activeJobIdRef.current = clientJobId;
      setActiveJobId(clientJobId);
      jobStartTimeRef.current = Date.now();
      jobSnapshotsRef.current.set(clientJobId, { filePath, fileName, isVideo });

      setJobStatus('queued');
      setProgressVal(0);
      setStatusMessage('Queued in GPU worker thread...');
      setJobPhase('PREPARING');
      setEtaSeconds?.(undefined);
      setFps?.(undefined);
      setRateStr?.('');

      // The backend names and reserves the output, then tells us where it
      // landed -- it is the only thing that can guarantee two jobs don't
      // claim the same file, so guessing the path here could only ever
      // disagree with reality.
      const { job_id: jobId, output_path: outPath } = await invoke<UpscaleJobHandle>(
        'run_upscale',
        {
          request: {
            job_id: clientJobId,
            input_path: filePath,
            output_dir: customOutputPath || null,
            model_id: selectedModel,
            gpu_id: selectedGpu,
            scale,
            tile_size: tileSize,
            is_video: isVideo,
          },
        }
      );
      pendingOutputPath.current = outPath;

      setJobStatus('running');
      onNotify('info', 'Upscaling Started', `Job ID: ${jobId.slice(0, 8)}...`);
    } catch (err) {
      activeJobIdRef.current = null;
      setActiveJobId(null);
      setJobStatus('ready');
      playErrorSound(isMuted);
      onNotify('error', 'Error Starting Upscale', String(err));
    }
  };

  const handleCancelUpscale = useCallback(
    async (idToCancel?: string) => {
      const targetId = idToCancel || activeJobId || activeJobIdRef.current;
      if (!targetId) return;
      try {
        await invoke('cancel_upscale', { jobId: targetId });
      } catch (err) {
        console.error('Cancel upscale failed:', err);
      } finally {
        activeJobIdRef.current = null;
        setActiveJobId(null);
        setJobStatus('ready');
        onNotify('info', 'Cancelled', 'Upscaling cancelled and resources freed.');
      }
    },
    [activeJobId, setActiveJobId, setJobStatus, onNotify]
  );

  const handleShowInExplorerNative = async (outPath?: string) => {
    const target = outPath || pendingOutputPath.current;
    if (!target) return;
    try {
      await revealItemInDir(target);
    } catch (err) {
      console.error('Failed to reveal file in explorer:', err);
    }
  };

  const isSingleFileJobActive = useCallback(
    () =>
      Boolean(
        activeJobId || activeJobIdRef.current || jobStatus === 'running' || jobStatus === 'queued'
      ),
    [activeJobId, jobStatus]
  );

  // Opens the same confirm dialog handleClearFile uses when a job is
  // active, without also clearing the file when it isn't. Lets Escape
  // route through the same guarded cancel flow as the "X" button instead
  // of instantly killing a possibly hour-long job.
  const requestCancelConfirmation = useCallback(() => {
    if (isSingleFileJobActive()) {
      setConfirmCancelOpen(true);
    }
  }, [isSingleFileJobActive]);

  const handleClearFile = useCallback(() => {
    if (isSingleFileJobActive()) {
      setConfirmCancelOpen(true);
      return;
    }

    setFilePath('');
    setFileName('');
    setUpscaledPath('');
    setIsVideo(false);
    setCurrentFileDims(null);
    setBatchItems([]);
    setJobStatus('ready');
    setProgressVal(0);
    setStatusMessage('');
    setJobPhase('');
    setEtaSeconds?.(undefined);
    setFps?.(undefined);
    setRateStr?.('');
    pendingOutputPath.current = '';
    activeJobIdRef.current = null;
    setActiveJobId(null);
    onNotify('info', 'Queue Cleared', 'Ready for next input.');
  }, [
    isSingleFileJobActive,
    setFilePath,
    setFileName,
    setUpscaledPath,
    setIsVideo,
    setCurrentFileDims,
    setBatchItems,
    setJobStatus,
    setProgressVal,
    setStatusMessage,
    setJobPhase,
    setEtaSeconds,
    setFps,
    setRateStr,
    setActiveJobId,
    onNotify,
  ]);

  const handleConfirmCancelAndClear = useCallback(async () => {
    const targetId = activeJobId || activeJobIdRef.current;
    if (targetId) {
      try {
        await invoke('cancel_upscale', { jobId: targetId });
      } catch (err) {
        console.error('Cancel backend upscale failed:', err);
      }
    }
    setConfirmCancelOpen(false);
    setFilePath('');
    setFileName('');
    setUpscaledPath('');
    setIsVideo(false);
    setCurrentFileDims(null);
    setBatchItems([]);
    setJobStatus('ready');
    setProgressVal(0);
    setStatusMessage('');
    setJobPhase('');
    setEtaSeconds?.(undefined);
    setFps?.(undefined);
    setRateStr?.('');
    pendingOutputPath.current = '';
    activeJobIdRef.current = null;
    setActiveJobId(null);
    onNotify('info', 'Upscale Cancelled', 'Processing stopped and GPU resources released.');
  }, [
    activeJobId,
    setFilePath,
    setFileName,
    setUpscaledPath,
    setIsVideo,
    setCurrentFileDims,
    setBatchItems,
    setJobStatus,
    setProgressVal,
    setStatusMessage,
    setJobPhase,
    setEtaSeconds,
    setFps,
    setRateStr,
    setActiveJobId,
    onNotify,
  ]);

  const handleDismissCancel = useCallback(() => {
    setConfirmCancelOpen(false);
  }, []);

  const handleSelectHistoryItem = (item: HistoryEntry) => {
    // History entries can be from a previous app session, so the asset
    // scope (in-memory, reset on every launch) may not include these
    // paths yet even though they were allowed when originally opened.
    allowMediaPath(item.originalPath);
    allowMediaPath(item.upscaledPath);

    if (item.originalPath) {
      setFilePath(item.originalPath);
      setFileName(item.fileName || item.originalPath.split(/[\\/]/).pop() || '');
      setIsVideo(Boolean(item.isVideo));
    }
    if (item.upscaledPath) {
      setUpscaledPath(item.upscaledPath);
      setJobStatus('succeeded');
    }
    if (item.scale) {
      setScale(item.scale);
    }
    // Entries record the model id, so restoring is an exact lookup rather
    // than a case-insensitive comparison of display strings that the live
    // catalog could word differently. Entries written before the id was
    // stored still carry a name, so fall back to the old match for those.
    const matchingModel =
      supportedModels.find((m) => item.modelId && m.id === item.modelId) ||
      supportedModels.find(
        (m) => item.modelName && m.name.toLowerCase() === item.modelName.toLowerCase()
      );
    if (matchingModel) {
      setSelectedModel(matchingModel.id);
    }
    setActiveNavTab(null);
  };

  return {
    pendingOutputPath,
    activeJobIdRef,
    jobSnapshotsRef,
    jobStartTimeRef,
    confirmCancelOpen,
    handleSelectCategory,
    handleSelectModel,
    handleSelectScale,
    handleStartUpscale,
    handleCancelUpscale,
    handleShowInExplorerNative,
    handleClearFile,
    handleConfirmCancelAndClear,
    handleDismissCancel,
    requestCancelConfirmation,
    handleSelectHistoryItem,
  };
}
