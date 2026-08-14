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
  activeJobId: string | null;
  confirmCancelOpen: boolean;
  requestCancelConfirmation: () => void;
  handleDismissCancel: () => void;
  setHistoryItems: React.Dispatch<React.SetStateAction<HistoryItem[]>>;
  handleOpenFile: () => void;
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
  activeJobId,
  confirmCancelOpen,
  requestCancelConfirmation,
  handleDismissCancel,
  setHistoryItems,
  handleOpenFile,
  handleToggleNavTab,
  setActiveNavTab,
  onNotify,
}: BatchSetupOptions) {
  const onItemCompleted = useCallback(
    (item: BatchItem, outputPath: string) => {
      const meta = SUPPORTED_MODELS.find((m) => m.id === selectedModel) || SUPPORTED_MODELS[0];
      const newHist = addHistoryItem({
        fileName: item.fileName || '',
        originalPath: item.filePath || '',
        upscaledPath: outputPath,
        modelName: meta.name,
        scale,
        isVideo: Boolean(item.isVideo),
      });
      setHistoryItems(newHist);
    },
    [selectedModel, scale, setHistoryItems]
  );

  const {
    batchItems,
    setBatchItems,
    activeJobId: queueActiveJobId,
    isBatchRunning,
    startBatch: handleStartBatchUpscale,
    cancelBatch,
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

  // A job can be "active" either as the single-file studio job (activeJobId,
  // passed in from outside) or as the currently-processing batch item
  // (queueActiveJobId, owned by this hook) -- combine both so shortcuts work
  // during a batch run too.
  const effectiveActiveJobId = activeJobId || queueActiveJobId;

  useKeyboardShortcuts({
    activeJobId: effectiveActiveJobId,
    isBatchActive: isBatchRunning,
    confirmCancelOpen,
    batchItemsCount: batchItems.length,
    handleOpenFile,
    handleStartBatchUpscale,
    // Only reached for the batch-active branch (see useKeyboardShortcuts) --
    // cancelBatch is already owned by this hook, so there's no need to
    // bridge through a container-level callback the way the single-file
    // path (requestCancelConfirmation) does.
    handleCancelUpscale: cancelBatch,
    requestCancelConfirmation,
    handleDismissCancel,
    handleToggleNavTab,
    setActiveNavTab,
  });

  return {
    batchItems,
    setBatchItems,
    queueActiveJobId,
    isBatchRunning,
    handleStartBatchUpscale,
    cancelBatch,
    handleQueueJobProgress,
    handleRemoveBatchItem,
  };
}
