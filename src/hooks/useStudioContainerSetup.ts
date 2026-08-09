import { useSettings } from './useSettings';
import { useModelCatalog } from './useModelCatalog';
import { useMediaSelection } from './useMediaSelection';
import { useStudioActions } from './useStudioActions';
import { useTelemetry } from './useTelemetry';
import { useStudioState } from './useStudioState';
import { useStudioEvents } from './useStudioEvents';
import { useBatchSetup } from './useBatchSetup';
import { useStudioJobStateSetup } from './useStudioJobStateSetup';

export function useStudioContainerSetup() {
  const state = useStudioState();
  const settings = useSettings(state.handleGpuReady);
  const catalog = useModelCatalog(state.handleNotify);

  const media = useMediaSelection(
    settings.isMuted,
    catalog.selectedModel,
    (cat) => state.setCategory(cat),
    state.handleNotify,
    state.handleResetJob
  );

  let handleCancelRef = (_id?: string) => {};

  const batch = useBatchSetup({
    selectedGpu: settings.selectedGpu,
    selectedModel: catalog.selectedModel,
    scale: settings.scale,
    tileSize: settings.tileSize,
    customOutputPath: settings.customOutputPath,
    isMuted: settings.isMuted,
    fileName: media.fileName,
    filePath: media.filePath,
    isVideo: media.isVideo,
    activeJobId: state.activeJobId,
    setHistoryItems: state.setHistoryItems,
    handleOpenFile: media.handleOpenFile,
    handleCancelUpscale: (id?: string) => handleCancelRef(id),
    handleToggleNavTab: state.handleToggleNavTab,
    setActiveNavTab: state.setActiveNavTab,
    onNotify: state.handleNotify,
  });

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
    setActiveJobId: state.setActiveJobId,
    setJobStatus: state.setJobStatus,
    setProgressVal: state.setProgressVal,
    setStatusMessage: state.setStatusMessage,
    setJobPhase: state.setJobPhase,
    setCategory: state.setCategory,
    setSelectedModel: catalog.setSelectedModel,
    setScale: settings.setScale,
    setFilePath: media.setFilePath,
    setFileName: media.setFileName,
    setUpscaledPath: media.setUpscaledPath,
    setIsVideo: media.setIsVideo,
    setActiveNavTab: state.setActiveNavTab,
    onNotify: state.handleNotify,
  });

  handleCancelRef = actions.handleCancelUpscale;

  const studioJobState = useStudioJobStateSetup({
    activeJobId: state.activeJobId,
    activeJobIdRef: actions.activeJobIdRef,
    pendingOutputPath: actions.pendingOutputPath,
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
    refreshInstalledModels: catalog.refreshInstalledModels,
    setDownloadingModelId: catalog.setDownloadingModelId,
    setDownloadProgress: catalog.setDownloadProgress,
    onNotify: state.handleNotify,
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
    handleSelectModel: actions.handleSelectModel,
    setScale: actions.handleSelectScale,
    handleSelectDestinationFolder: settings.handleSelectDestinationFolder,
    handleLoadHistoryItem: actions.handleSelectHistoryItem,
  };
}
