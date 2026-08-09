import { useCallback } from 'react';
import { useUpscaleQueue } from './useUpscaleQueue';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { SUPPORTED_MODELS, BatchItem } from '../lib/types';
import { addHistoryItem, HistoryItem } from '../lib/history';

interface BatchSetupOptions {
  selectedGpu: number;
  selectedModel: string;
  scale: number;
  tileSize: number;
  customOutputPath: string;
  isMuted: boolean;
  fileName: string | null;
  filePath: string | null;
  isVideo: boolean;
  activeJobId: string | null;
  setHistoryItems: React.Dispatch<React.SetStateAction<HistoryItem[]>>;
  handleOpenFile: () => void;
  handleCancelUpscale: (idToCancel?: string) => void;
  handleToggleNavTab: (tab: 'models' | 'history' | 'settings' | 'about') => void;
  setActiveNavTab: (tab: 'models' | 'history' | 'settings' | 'about' | null) => void;
  onNotify: (
    type: 'success' | 'error' | 'info' | 'warning',
    title: string,
    message: string
  ) => void;
}

export function useBatchSetup({
  selectedGpu,
  selectedModel,
  scale,
  tileSize,
  customOutputPath,
  fileName,
  filePath,
  isVideo,
  activeJobId,
  setHistoryItems,
  handleOpenFile,
  handleCancelUpscale,
  handleToggleNavTab,
  setActiveNavTab,
  onNotify,
}: BatchSetupOptions) {
  const onItemCompleted = useCallback(
    (item: BatchItem, outputPath: string) => {
      const meta = SUPPORTED_MODELS.find((m) => m.id === selectedModel) || SUPPORTED_MODELS[0];
      const newHist = addHistoryItem({
        fileName: item.fileName || fileName || '',
        originalPath: item.filePath || filePath || '',
        upscaledPath: outputPath,
        modelName: meta.name,
        scale,
        isVideo: item.isVideo ?? isVideo,
      });
      setHistoryItems(newHist);
    },
    [selectedModel, fileName, filePath, scale, isVideo, setHistoryItems]
  );

  const {
    batchItems,
    setBatchItems,
    startBatch: handleStartBatchUpscale,
    handleJobProgress: handleQueueJobProgress,
    removeItem: handleRemoveBatchItem,
  } = useUpscaleQueue({
    selectedGpu,
    selectedModel,
    scale,
    tileSize,
    customOutputPath,
    onNotify,
    onItemCompleted,
  });

  useKeyboardShortcuts({
    activeJobId,
    filePath: filePath || '',
    batchItemsCount: batchItems.length,
    handleOpenFile,
    handleStartBatchUpscale,
    handleCancelUpscale: () => handleCancelUpscale(),
    handleToggleNavTab,
    setActiveNavTab,
  });

  return {
    batchItems,
    setBatchItems,
    handleStartBatchUpscale,
    handleQueueJobProgress,
    handleRemoveBatchItem,
  };
}
