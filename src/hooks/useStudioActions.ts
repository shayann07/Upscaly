import { useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { playErrorSound } from '../lib/sound';
import { ModelInfo, BatchItem, HistoryEntry } from '../lib/types';
import { SUPPORTED_MODELS } from '../lib/types';
import { joinPath } from '../lib/outputPaths';

interface StudioActionsOptions {
  filePath: string | null;
  fileName: string | null;
  isVideo: boolean;
  scale: number;
  selectedModel: string;
  selectedGpu: number;
  tileSize: number;
  customOutputPath: string;
  isMuted: boolean;
  batchItems: BatchItem[];
  handleStartBatchUpscale?: () => void;
  supportedModels: ModelInfo[];
  installedModels: string[];
  activeJobId: string | null;
  setActiveJobId: (id: string | null) => void;
  setJobStatus: (status: string) => void;
  setProgressVal: (val: number) => void;
  setStatusMessage: (msg: string) => void;
  setJobPhase: (phase: string) => void;
  setCategory: (cat: 'photos' | 'anime' | 'video') => void;
  setSelectedModel: (id: string) => void;
  setScale: (s: number) => void;
  setFilePath: (path: string) => void;
  setFileName: (name: string) => void;
  setUpscaledPath: (path: string) => void;
  setIsVideo: (isVid: boolean) => void;
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
  tileSize,
  customOutputPath,
  isMuted,
  batchItems,
  handleStartBatchUpscale,
  supportedModels,
  installedModels,
  activeJobId,
  setActiveJobId,
  setJobStatus,
  setProgressVal,
  setStatusMessage,
  setJobPhase,
  setCategory,
  setSelectedModel,
  setScale,
  setFilePath,
  setFileName,
  setUpscaledPath,
  setIsVideo,
  setActiveNavTab,
  onNotify,
}: StudioActionsOptions) {
  const pendingOutputPath = useRef<string>('');
  const activeJobIdRef = useRef<string | null>(null);
  const jobStartTimeRef = useRef<number | null>(null);

  const handleSelectCategory = useCallback(
    (cat: 'photos' | 'anime' | 'video') => {
      setCategory(cat);
      const filtered = supportedModels.filter((m) => m.cat === cat);
      if (filtered.length > 0) {
        const installedFiltered = filtered.filter((m) => installedModels.includes(m.id));
        const chosen = installedFiltered.length > 0 ? installedFiltered[0] : filtered[0];
        setSelectedModel(chosen.id);
        if (chosen.scale) setScale(chosen.scale);
      }
    },
    [supportedModels, installedModels, setCategory, setSelectedModel, setScale]
  );

  const handleSelectModel = useCallback(
    (modelId: string) => {
      setSelectedModel(modelId);
      const modelInfo = supportedModels.find((m) => m.id === modelId);
      if (modelInfo) {
        if (modelInfo.scale) setScale(modelInfo.scale);
        const modelCat = modelInfo.cat === 'photo' ? 'photos' : (modelInfo.cat as 'anime' | 'video');
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
        const matchingModel =
          supportedModels.find(
            (m) => m.scale === newScale && (installedModels.length === 0 || installedModels.includes(m.id))
          ) || supportedModels.find((m) => m.scale === newScale);
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
    if (!filePath || !fileName) return;
    try {
      const clientJobId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      activeJobIdRef.current = clientJobId;
      setActiveJobId(clientJobId);
      jobStartTimeRef.current = Date.now();

      setJobStatus('queued');
      setProgressVal(0);
      setStatusMessage('Queued in GPU worker thread...');
      setJobPhase('PREPARING');

      const ext = isVideo ? '.mp4' : '.png';
      const baseName = fileName.replace(/\.[^/.]+$/, '');
      const outputFilename = `${baseName}_upscaled_${scale}x${ext}`;

      let outPath = '';
      if (customOutputPath) {
        outPath = joinPath(customOutputPath, outputFilename);
      } else {
        const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
        const parentDir = lastSlash >= 0 ? filePath.substring(0, lastSlash) : '';
        outPath = joinPath(parentDir, outputFilename);
      }
      pendingOutputPath.current = outPath;

      const jobId = await invoke<string>('run_upscale', {
        request: {
          job_id: clientJobId,
          input_path: filePath,
          output_path: outPath,
          model_id: selectedModel,
          gpu_id: selectedGpu,
          scale,
          tile_size: tileSize,
          is_video: isVideo,
        },
      });

      setJobStatus('processing');
      onNotify('info', 'Upscaling Started', `Job ID: ${jobId.slice(0, 8)}...`);
    } catch (err) {
      setActiveJobId(null);
      setJobStatus('idle');
      playErrorSound(isMuted);
      onNotify('error', 'Error Starting Upscale', String(err));
    }
  };

  const handleCancelUpscale = async (idToCancel?: string) => {
    const targetId = idToCancel || activeJobId;
    if (!targetId) return;
    try {
      await invoke('cancel_upscale', { jobId: targetId });
      setActiveJobId(null);
      setJobStatus('idle');
      onNotify('info', 'Cancelled', 'Upscaling cancelled.');
    } catch (err) {
      console.error('Cancel upscale failed:', err);
    }
  };

  const handleShowInExplorerNative = async (outPath?: string) => {
    const target = outPath || pendingOutputPath.current;
    if (!target) return;
    try {
      await revealItemInDir(target);
    } catch (err) {
      console.error('Failed to reveal file in explorer:', err);
    }
  };

  const handleClearFile = () => {
    setFilePath('');
    setFileName('');
    setUpscaledPath('');
    setIsVideo(false);
    setJobStatus('idle');
    pendingOutputPath.current = '';
    activeJobIdRef.current = null;
    setActiveJobId(null);
  };

  const handleSelectHistoryItem = (item: HistoryEntry) => {
    if (item.originalPath) {
      setFilePath(item.originalPath);
      setFileName(item.fileName || item.originalPath.split(/[\\/]/).pop() || '');
      setIsVideo(Boolean(item.isVideo));
    }
    if (item.upscaledPath) {
      setUpscaledPath(item.upscaledPath);
      setJobStatus('completed');
    }
    if (item.scale) {
      setScale(item.scale);
    }
    const matchingModel = SUPPORTED_MODELS.find(
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
    handleSelectCategory,
    handleSelectModel,
    handleSelectScale,
    handleStartUpscale,
    handleCancelUpscale,
    handleShowInExplorerNative,
    handleClearFile,
    handleSelectHistoryItem,
  };
}
