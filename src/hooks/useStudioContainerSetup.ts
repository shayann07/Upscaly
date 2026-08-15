import { useRef, useCallback } from 'react';
import { useSettings } from './useSettings';
import { useModelCatalog } from './useModelCatalog';
import { useMediaSelection } from './useMediaSelection';
import { useStudioActions } from './useStudioActions';
import { useTelemetry } from './useTelemetry';
import { useStudioState } from './useStudioState';
import { useStudioEvents } from './useStudioEvents';
import { useBatchSetup } from './useBatchSetup';
import { useStudioJobStateSetup } from './useStudioJobStateSetup';
import { useDragDrop } from './useDragDrop';

export function useStudioContainerSetup() {
  const state = useStudioState();
  const settings = useSettings(state.handleGpuReady);
  const catalog = useModelCatalog(state.handleNotify);

  const onCategorySelectRef = useRef<(cat: 'photos' | 'anime' | 'video') => void>((cat) =>
    state.setCategory(cat)
  );
  const handleOpenFileRef = useRef<() => void>(() => {});
  const requestCancelConfirmationRef = useRef<() => void>(() => {});
  const handleDismissCancelRef = useRef<() => void>(() => {});

  // useBatchSetup owns the single batchItems store (via useUpscaleQueue) and
  // useMediaSelection needs to write into it -- but useBatchSetup also needs
  // media's handleOpenFile for the Cmd+O shortcut, and the confirm-cancel
  // callbacks that live on useStudioActions (which itself needs media's
  // filePath/fileName). Break the three-way cycle with ref bridges for the
  // callbacks; confirmCancelOpen itself is read directly since it's now
  // owned by useStudioState, constructed before any of this.
  const batch = useBatchSetup({
    selectedGpu: settings.selectedGpu,
    selectedModel: catalog.selectedModel,
    supportedModels: catalog.supportedModels,
    scale: settings.scale,
    tileSize: settings.tileSize,
    customOutputPath: settings.customOutputPath,
    isMuted: settings.isMuted,
    activeJobId: state.activeJobId,
    confirmCancelOpen: state.confirmCancelOpen,
    requestCancelConfirmation: () => requestCancelConfirmationRef.current(),
    handleDismissCancel: () => handleDismissCancelRef.current(),
    setHistoryItems: state.setHistoryItems,
    handleOpenFile: () => handleOpenFileRef.current(),
    handleToggleNavTab: state.handleToggleNavTab,
    setActiveNavTab: state.setActiveNavTab,
    onNotify: state.handleNotify,
  });

  const media = useMediaSelection({
    isMuted: settings.isMuted,
    selectedModel: catalog.selectedModel,
    setBatchItems: batch.setBatchItems,
    onCategorySelect: (cat) => onCategorySelectRef.current(cat),
    onNotify: state.handleNotify,
    onResetJob: state.handleResetJob,
  });

  handleOpenFileRef.current = media.handleOpenFile;

  const { isDragOver } = useDragDrop(media.handleFilesDropped, state.handleNotify);

  const actions = useStudioActions({
    filePath: media.filePath,
    fileName: media.fileName,
    isVideo: media.isVideo,
    scale: settings.scale,
    selectedModel: catalog.selectedModel,
    selectedGpu: settings.selectedGpu,
    gpus: settings.gpus,
    tileSize: settings.tileSize,
    customOutputPath: settings.customOutputPath,
    isMuted: settings.isMuted,
    batchItems: batch.batchItems,
    handleStartBatchUpscale: batch.handleStartBatchUpscale,
    supportedModels: catalog.supportedModels,
    installedModels: catalog.installedModels,
    activeJobId: state.activeJobId,
    jobStatus: state.jobStatus,
    confirmCancelOpen: state.confirmCancelOpen,
    setConfirmCancelOpen: state.setConfirmCancelOpen,
    setActiveJobId: state.setActiveJobId,
    setJobStatus: state.setJobStatus,
    setProgressVal: state.setProgressVal,
    setStatusMessage: state.setStatusMessage,
    setJobPhase: state.setJobPhase,
    setEtaSeconds: state.setEtaSeconds,
    setFps: state.setFps,
    setRateStr: state.setRateStr,
    setCategory: state.setCategory,
    setSelectedModel: catalog.setSelectedModel,
    setScale: settings.setScale,
    setFilePath: media.setFilePath,
    setFileName: media.setFileName,
    setUpscaledPath: media.setUpscaledPath,
    setIsVideo: media.setIsVideo,
    setCurrentFileDims: media.setCurrentFileDims,
    setBatchItems: batch.setBatchItems,
    setActiveNavTab: state.setActiveNavTab,
    onNotify: state.handleNotify,
  });

  onCategorySelectRef.current = actions.handleSelectCategory;
  requestCancelConfirmationRef.current = actions.requestCancelConfirmation;
  handleDismissCancelRef.current = actions.handleDismissCancel;

  // The main Cancel button / Escape shortcut needs to reach whichever job is
  // actually running -- a single-file studio job (state.activeJobId) or an
  // in-flight batch (batch.isBatchRunning). Cancelling a batch stops every
  // non-terminal item, not just the one currently processing.
  const handleCancelUpscale = useCallback(() => {
    if (batch.isBatchRunning) {
      return batch.cancelBatch();
    }
    return actions.handleCancelUpscale();
  }, [batch.isBatchRunning, batch.cancelBatch, actions.handleCancelUpscale]);

  const studioJobState = useStudioJobStateSetup({
    activeJobId: state.activeJobId,
    activeJobIdRef: actions.activeJobIdRef,
    jobSnapshotsRef: actions.jobSnapshotsRef,
    pendingOutputPath: actions.pendingOutputPath,
    jobStartTimeRef: actions.jobStartTimeRef,
    currentFileDims: media.currentFileDims,
    upscaledPath: media.upscaledPath,
    selectedModel: catalog.selectedModel,
    fileName: media.fileName,
    filePath: media.filePath,
    scale: settings.scale,
    isVideo: media.isVideo,
    isMuted: settings.isMuted,
    setActiveJobId: state.setActiveJobId,
    setProgressVal: state.setProgressVal,
    setJobStatus: state.setJobStatus,
    setJobPhase: state.setJobPhase,
    setEtaSeconds: state.setEtaSeconds,
    setFps: state.setFps,
    setRateStr: state.setRateStr,
    setStatusMessage: state.setStatusMessage,
    setUpscaledPath: media.setUpscaledPath,
    setHistoryItems: state.setHistoryItems,
    refreshInstalledModels: catalog.refreshInstalledModels,
    onNotify: state.handleNotify,
  });

  useStudioEvents({
    handleQueueJobProgress: batch.handleQueueJobProgress,
    studioJobState,
    setDownloadingModelId: catalog.setDownloadingModelId,
    setDownloadProgress: catalog.setDownloadProgress,
  });

  const telemetry = useTelemetry({
    gpus: settings.gpus,
    selectedGpu: settings.selectedGpu,
    jobStatus: state.jobStatus,
    tileSize: settings.tileSize,
  });

  const handleStartUpscale = () => {
    if (batch.batchItems.length > 1) {
      batch.handleStartBatchUpscale();
    } else {
      actions.handleStartUpscale();
    }
  };

  return {
    ...state,
    ...settings,
    ...catalog,
    ...media,
    ...actions,
    ...batch,
    ...telemetry,
    handleStartUpscale,
    handleCancelUpscale,
    handleCancelItem: actions.handleCancelUpscale,
    isDragOver,
    handleSelectModel: actions.handleSelectModel,
    setScale: actions.handleSelectScale,
    handleSelectDestinationFolder: settings.handleSelectDestinationFolder,
    handleLoadHistoryItem: actions.handleSelectHistoryItem,
  };
}
