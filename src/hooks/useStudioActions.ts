import { useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { playErrorSound } from '../lib/sound';
import { ModelInfo, BatchItem, HistoryEntry } from '../lib/types';
import { SUPPORTED_MODELS } from '../lib/types';

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
  setCategory: (cat: 'photos' | 'anime' | 'video') => void;
  setSelectedModel: (id: string) => void;
  setScale: (s: number) => void;
  setCustomOutputPath: (path: string) => void;
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
  setCategory,
  setSelectedModel,
  setScale,
  setCustomOutputPath,
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
        setSelectedModel(installedFiltered.length > 0 ? installedFiltered[0].id : filtered[0].id);
      }
    },
    [supportedModels, installedModels, setCategory, setSelectedModel]
  );

  const handleStartUpscale = async () => {
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
      const ext = isVideo ? '.mp4' : '.png';
      const baseName = fileName.replace(/\.[^/.]+$/, '');
      const outputFilename = `${baseName}_upscaled_${scale}x${ext}`;
      const parentDir = filePath.substring(
        0,
        Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
      );
      const outPath = customOutputPath
        ? `${customOutputPath}\\${outputFilename}`
        : `${parentDir}\\${outputFilename}`;
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
      onNotify('error', 'Error Cancelling', String(err));
    }
  };

  const handleSelectDestinationFolder = async () => {
    try {
      const selected = await invoke<string | null>('select_folder');
      if (selected) setCustomOutputPath(selected);
    } catch (err) {
      onNotify('error', 'Folder Picker Error', String(err));
    }
  };

  const handleShowInExplorerNative = async (targetPath: string) => {
    if (!targetPath) return;
    try {
      await revealItemInDir(targetPath);
    } catch {
      onNotify('info', 'Output File Location', targetPath);
    }
  };

  const handleLoadHistoryItem = (item: HistoryEntry) => {
    setFilePath(item.originalPath || '');
    setFileName(item.fileName || '');
    setUpscaledPath(item.upscaledPath || '');
    setIsVideo(item.isVideo ?? false);
    setJobStatus('completed');
    setActiveNavTab(null);
  };

  const handleSelectModel = (modelId: string) => {
    setSelectedModel(modelId);
    const modelInfo = SUPPORTED_MODELS.find((m) => m.id === modelId);
    if (modelInfo) {
      if (modelInfo.scale) setScale(modelInfo.scale);
      const modelCat = modelInfo.cat === 'photo' ? 'photos' : (modelInfo.cat as 'anime' | 'video');
      setCategory(modelCat);
    }
  };

  return {
    pendingOutputPath,
    activeJobIdRef,
    handleSelectCategory,
    handleStartUpscale,
    handleCancelUpscale,
    handleSelectDestinationFolder,
    handleShowInExplorerNative,
    handleLoadHistoryItem,
    handleSelectModel,
  };
}
