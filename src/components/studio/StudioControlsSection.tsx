import { ProgressOverlay } from '../ProgressOverlay';
import { CompletionCard } from '../CompletionCard';
import { SettingsPanel } from '../SettingsPanel';
import { ModelInfo } from '../../lib/types';

interface StudioControlsSectionProps {
  isProc: boolean;
  progressVal: number;
  statusMessage: string;
  jobPhase: string;
  etaSeconds?: number;
  fps?: number;
  rateStr: string;
  activeVramGb: string;
  tileSize: number;
  handleCancelUpscale: () => void;
  jobStatus: string;
  upscaledPath: string | null;
  currentFileDims: { w: number; h: number } | null;
  scale: number;
  comparisonViewMode: 'split' | 'side-by-side';
  zoomLevel: number;
  setComparisonViewMode: (mode: 'split' | 'side-by-side') => void;
  handleCycleZoom: () => void;
  handleShowInExplorerNative: (path: string) => void;
  handleClearFile: () => void;
  supportedModels: ModelInfo[];
  category: 'photos' | 'anime' | 'video';
  handleSelectCategory: (cat: 'photos' | 'anime' | 'video') => void;
  installedModels: string[];
  selectedModel: string;
  handleSelectModel: (id: string) => void;
  setScale: (s: number) => void;
  filePath: string | null;
  batchItemsCount: number;
  handleStartUpscale: () => void;
  isMuted: boolean;
  handleToggleMute: () => void;
  setActiveNavTab: (tab: 'models' | 'history' | 'settings' | 'about' | null) => void;
}

export function StudioControlsSection(props: StudioControlsSectionProps) {
  const {
    isProc,
    progressVal,
    statusMessage,
    jobPhase,
    etaSeconds,
    fps,
    rateStr,
    activeVramGb,
    tileSize,
    handleCancelUpscale,
    jobStatus,
    upscaledPath,
    currentFileDims,
    scale,
    comparisonViewMode,
    zoomLevel,
    setComparisonViewMode,
    handleCycleZoom,
    handleShowInExplorerNative,
    handleClearFile,
    supportedModels,
    category,
    handleSelectCategory,
    installedModels,
    selectedModel,
    handleSelectModel,
    setScale,
    filePath,
    batchItemsCount,
    handleStartUpscale,
    isMuted,
    handleToggleMute,
    setActiveNavTab,
  } = props;

  return (
    <>
      <div
        style={{
          position: 'absolute',
          bottom: 14,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 42,
        }}
      >
        <SettingsPanel
          supportedModels={supportedModels}
          category={category}
          onSelectCategory={handleSelectCategory}
          installedModels={installedModels}
          selectedModel={selectedModel}
          onSelectModel={handleSelectModel}
          scale={scale}
          onSelectScale={setScale}
          isProcessing={isProc}
          hasFiles={Boolean(filePath || batchItemsCount > 0)}
          isBatchMode={batchItemsCount > 1}
          onRun={handleStartUpscale}
          onCancel={() => handleCancelUpscale()}
          isMuted={isMuted}
          onToggleMute={handleToggleMute}
          onOpenCatalog={() => setActiveNavTab('models')}
        />
      </div>

      {isProc && (
        <ProgressOverlay
          percentage={progressVal}
          statusText={statusMessage}
          phase={jobPhase || 'UPSCALE 4X'}
          etaSeconds={etaSeconds}
          fps={fps}
          rate={rateStr}
          vram={activeVramGb}
          tileCount={tileSize === 0 ? 'AUTO' : `${tileSize}px`}
          onCancel={() => handleCancelUpscale()}
        />
      )}

      {jobStatus === 'completed' && upscaledPath && (
        <CompletionCard
          outputPath={upscaledPath}
          outputDims={
            currentFileDims
              ? { w: currentFileDims.w * scale, h: currentFileDims.h * scale }
              : undefined
          }
          compareMode={comparisonViewMode === 'split' ? 'split' : 'side'}
          zoom={zoomLevel}
          onSetSplit={() => setComparisonViewMode('split')}
          onSetSide={() => setComparisonViewMode('side-by-side')}
          onCycleZoom={handleCycleZoom}
          onOpen={() => handleShowInExplorerNative(upscaledPath)}
          onReset={handleClearFile}
        />
      )}
    </>
  );
}
