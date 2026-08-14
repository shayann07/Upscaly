import { useStudioContainerSetup } from '../../hooks/useStudioContainerSetup';
import { StudioCanvas } from './StudioCanvas';
import { StudioModals } from './StudioModals';

export function StudioLayoutContainer() {
  const setup = useStudioContainerSetup();

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--bg-stripe)',
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-ui)',
        fontSize: '13px',
        overflow: 'hidden',
        userSelect: 'none',
        WebkitFontSmoothing: 'antialiased',
      }}
    >
      <StudioCanvas
        filePath={setup.filePath}
        fileName={setup.fileName}
        upscaledPath={setup.upscaledPath}
        currentFileDims={setup.currentFileDims}
        scale={setup.scale}
        comparisonViewMode={setup.comparisonViewMode}
        setComparisonViewMode={setup.setComparisonViewMode}
        zoomLevel={setup.zoomLevel}
        setZoomLevel={setup.setZoomLevel}
        handleOpenFile={setup.handleOpenFile}
        handleOpenFolder={setup.handleOpenFolder}
        handleShowInExplorerNative={setup.handleShowInExplorerNative}
        handleClearFile={setup.handleClearFile}
        confirmCancelOpen={setup.confirmCancelOpen}
        handleConfirmCancelAndClear={setup.handleConfirmCancelAndClear}
        handleDismissCancel={setup.handleDismissCancel}
        jobStatus={setup.jobStatus}
        progressVal={setup.progressVal}
        statusMessage={setup.statusMessage}
        jobPhase={setup.jobPhase}
        etaSeconds={setup.etaSeconds}
        fps={setup.fps}
        rateStr={setup.rateStr}
        activeVramGb={setup.activeVramGb}
        tileSize={setup.tileSize}
        handleCancelUpscale={setup.handleCancelUpscale}
        handleCycleZoom={() =>
          setup.setZoomLevel((prev) => (prev === 1 ? 2 : prev === 2 ? 4 : prev === 4 ? 8 : 1))
        }
        batchItems={setup.batchItems}
        selectedGpu={setup.selectedGpu}
        gpus={setup.gpus}
        setSelectedGpu={setup.setSelectedGpu}
        isVramOverflowing={setup.isVramOverflowing}
        activeNavTab={setup.activeNavTab}
        handleToggleNavTab={setup.handleToggleNavTab}
        setFilePath={setup.setFilePath}
        setFileName={setup.setFileName}
        setCurrentFileDims={setup.setCurrentFileDims}
        setBatchItems={setup.setBatchItems}
        handleRemoveBatchItem={setup.handleRemoveBatchItem}
        supportedModels={setup.supportedModels}
        category={setup.category}
        handleSelectCategory={setup.handleSelectCategory}
        installedModels={setup.installedModels}
        selectedModel={setup.selectedModel}
        handleSelectModel={setup.handleSelectModel}
        setScale={setup.setScale}
        handleStartUpscale={setup.handleStartUpscale}
        isMuted={setup.isMuted}
        handleToggleMute={setup.handleToggleMute}
        setActiveNavTab={setup.setActiveNavTab}
      />

      <StudioModals
        activeNavTab={setup.activeNavTab}
        setActiveNavTab={setup.setActiveNavTab}
        gpus={setup.gpus}
        selectedGpu={setup.selectedGpu}
        setSelectedGpu={setup.setSelectedGpu}
        tileSize={setup.tileSize}
        setTileSize={setup.setTileSize}
        customOutputPath={setup.customOutputPath}
        setCustomOutputPath={setup.setCustomOutputPath}
        handleSelectDestinationFolder={setup.handleSelectDestinationFolder}
        jobStatus={setup.jobStatus}
        addToast={setup.handleNotify}
        supportedModels={setup.supportedModels}
        installedModels={setup.installedModels}
        handleDownloadModel={setup.handleDownloadModel}
        downloadingModelId={setup.downloadingModelId}
        downloadProgress={setup.downloadProgress}
        historyItems={setup.historyItems}
        handleLoadHistoryItem={setup.handleLoadHistoryItem}
        toasts={setup.toasts}
        removeToast={(id: string) => setup.setToasts((prev) => prev.filter((t) => t.id !== id))}
      />
    </div>
  );
}
