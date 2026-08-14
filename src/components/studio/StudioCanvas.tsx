import React from 'react';
import { Titlebar } from '../Titlebar';
import { BatchQueueView } from '../BatchQueueView';
import { ConfirmCancelDialog } from '../ConfirmCancelDialog';
import { StudioPreviewSection } from './StudioPreviewSection';
import { StudioControlsSection } from './StudioControlsSection';
import { BatchItem, ModelInfo, GpuInfo } from '../../lib/types';

interface StudioCanvasProps {
  filePath: string | null;
  fileName: string | null;
  upscaledPath: string | null;
  currentFileDims: { w: number; h: number } | null;
  scale: number;
  comparisonViewMode: 'split' | 'side-by-side';
  setComparisonViewMode: (mode: 'split' | 'side-by-side') => void;
  zoomLevel: number;
  setZoomLevel: React.Dispatch<React.SetStateAction<number>>;
  handleOpenFile: () => void;
  handleOpenFolder?: () => void;
  handleShowInExplorerNative: (path: string) => void;
  handleClearFile: () => void;
  confirmCancelOpen?: boolean;
  handleConfirmCancelAndClear?: () => void;
  handleDismissCancel?: () => void;
  jobStatus: string;
  progressVal: number;
  statusMessage: string;
  jobPhase: string;
  etaSeconds?: number;
  fps?: number;
  rateStr: string;
  activeVramGb: string;
  tileSize: number;
  handleCancelUpscale: () => void;
  handleCancelItem?: (id?: string) => void;
  handleCycleZoom: () => void;
  batchItems: BatchItem[];
  selectedGpu: number;
  gpus: GpuInfo[];
  setSelectedGpu: (gpu: number) => void;
  isVramOverflowing: boolean;
  activeNavTab: 'models' | 'history' | 'settings' | 'about' | null;
  handleToggleNavTab: (tab: 'models' | 'history' | 'settings' | 'about') => void;
  setFilePath: (path: string) => void;
  setFileName: (name: string) => void;
  setCurrentFileDims: (dims: { w: number; h: number } | null) => void;
  setBatchItems: React.Dispatch<React.SetStateAction<BatchItem[]>>;
  handleRemoveBatchItem: (id: string) => void;
  supportedModels: ModelInfo[];
  category: 'photos' | 'anime' | 'video';
  handleSelectCategory: (cat: 'photos' | 'anime' | 'video') => void;
  installedModels: string[];
  selectedModel: string;
  handleSelectModel: (id: string) => void;
  setScale: (s: number) => void;
  handleStartUpscale: () => void;
  isMuted: boolean;
  handleToggleMute: () => void;
  setActiveNavTab: (tab: 'models' | 'history' | 'settings' | 'about' | null) => void;
}

export function StudioCanvas(props: StudioCanvasProps) {
  const {
    filePath,
    fileName,
    upscaledPath,
    currentFileDims,
    scale,
    comparisonViewMode,
    setComparisonViewMode,
    zoomLevel,
    setZoomLevel,
    handleOpenFile,
    handleOpenFolder,
    handleShowInExplorerNative,
    handleClearFile,
    confirmCancelOpen,
    handleConfirmCancelAndClear,
    handleDismissCancel,
    jobStatus,
    progressVal,
    statusMessage,
    jobPhase,
    etaSeconds,
    fps,
    rateStr,
    activeVramGb,
    tileSize,
    handleCancelUpscale,
    handleCancelItem,
    handleCycleZoom,
    batchItems,
    selectedGpu,
    gpus,
    setSelectedGpu,
    isVramOverflowing,
    activeNavTab,
    handleToggleNavTab,
    setFilePath,
    setFileName,
    setCurrentFileDims,
    setBatchItems,
    handleRemoveBatchItem,
    supportedModels,
    category,
    handleSelectCategory,
    installedModels,
    selectedModel,
    handleSelectModel,
    setScale,
    handleStartUpscale,
    isMuted,
    handleToggleMute,
    setActiveNavTab,
  } = props;

  const isProc = jobStatus === 'processing' || jobStatus === 'queued' || jobStatus === 'running';
  const currentFileName = filePath || (batchItems.length > 0 ? batchItems[0].fileName : null);

  return (
    <>
      <StudioPreviewSection
        filePath={filePath}
        batchItems={batchItems}
        upscaledPath={upscaledPath}
        jobStatus={jobStatus}
        comparisonViewMode={comparisonViewMode}
        zoomLevel={zoomLevel}
        setZoomLevel={setZoomLevel}
        handleOpenFile={handleOpenFile}
        handleOpenFolder={handleOpenFolder}
        isProc={isProc}
        progressVal={progressVal}
      />

      <Titlebar
        hasFiles={Boolean(filePath || batchItems.length > 0)}
        currentFile={currentFileName}
        originalDims={currentFileDims}
        outputDims={
          currentFileDims ? { w: currentFileDims.w * scale, h: currentFileDims.h * scale } : null
        }
        isDone={jobStatus === 'completed'}
        isProcessing={isProc}
        selectedGpu={selectedGpu}
        availableGpus={gpus.map((g) => ({
          id: g.id,
          name: g.name,
          detail: g.detail || (g.id === 0 ? 'Default GPU' : 'Vulkan Device'),
        }))}
        onSelectGpu={setSelectedGpu}
        isVramOverflowing={isVramOverflowing}
        activeNavTab={activeNavTab}
        onToggleNavTab={handleToggleNavTab}
        onRemoveFile={handleClearFile}
      />

      <BatchQueueView
        items={batchItems}
        selectedId={batchItems.find((b) => b.fileName === fileName)?.id}
        selectedScale={scale}
        currentFileDims={currentFileDims}
        onSelect={(id) => {
          const item = batchItems.find((b) => b.id === id);
          if (item && item.filePath && item.fileName) {
            setFilePath(item.filePath);
            setFileName(item.fileName);
            if (item.w && item.h) setCurrentFileDims({ w: item.w, h: item.h });
          }
        }}
        onAddFiles={handleOpenFile}
        onAddMoreFiles={handleOpenFile}
        onClear={handleClearFile}
        onClearCompleted={() =>
          setBatchItems((prev) =>
            prev.filter((b) => b.status !== 'done' && (b.status as string) !== 'completed')
          )
        }
        onRemoveItem={handleRemoveBatchItem}
        onCancelItem={handleCancelItem}
      />

      <StudioControlsSection
        isProc={isProc}
        progressVal={progressVal}
        statusMessage={statusMessage}
        jobPhase={jobPhase}
        etaSeconds={etaSeconds}
        fps={fps}
        rateStr={rateStr}
        activeVramGb={activeVramGb}
        tileSize={tileSize}
        handleCancelUpscale={handleCancelUpscale}
        jobStatus={jobStatus}
        upscaledPath={upscaledPath}
        currentFileDims={currentFileDims}
        scale={scale}
        comparisonViewMode={comparisonViewMode}
        zoomLevel={zoomLevel}
        setComparisonViewMode={setComparisonViewMode}
        handleCycleZoom={handleCycleZoom}
        handleShowInExplorerNative={handleShowInExplorerNative}
        handleClearFile={handleClearFile}
        supportedModels={supportedModels}
        category={category}
        handleSelectCategory={handleSelectCategory}
        installedModels={installedModels}
        selectedModel={selectedModel}
        handleSelectModel={handleSelectModel}
        setScale={setScale}
        filePath={filePath}
        batchItemsCount={batchItems.length}
        handleStartUpscale={handleStartUpscale}
        isMuted={isMuted}
        handleToggleMute={handleToggleMute}
        setActiveNavTab={setActiveNavTab}
      />

      <ConfirmCancelDialog
        isOpen={Boolean(confirmCancelOpen)}
        onConfirm={handleConfirmCancelAndClear || (() => {})}
        onDismiss={handleDismissCancel || (() => {})}
      />
    </>
  );
}
