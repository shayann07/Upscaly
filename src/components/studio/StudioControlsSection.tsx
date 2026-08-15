import { memo, useMemo } from 'react';
import { ProgressOverlay } from '../ProgressOverlay';
import { CompletionCard } from '../CompletionCard';
import { SettingsPanel } from '../SettingsPanel';
import {
  useActiveVramGb,
  useCategory,
  useComparisonViewMode,
  useInstalledModels,
  useIsMuted,
  useIsProcessing,
  useItemCount,
  useProgressItem,
  useScale,
  useSelectedItem,
  useSelectedModel,
  useSupportedModels,
  useTileSize,
  useUpscaledPath,
  useZoomLevel,
} from '../../store/selectors';
import { studioActions } from '../../store/studioStore';
import {
  cancelAll,
  clearFile,
  selectCategory,
  selectModel,
  selectScale,
  showInExplorer,
  startUpscale,
} from '../../store/studioCommands';

// Module-scope handlers: stable for the life of the app, so the panels below
// are not handed a fresh closure on every progress tick.
const handleStartUpscale = () => void startUpscale();
const handleCancel = () => void cancelAll();
const handleOpenCatalog = () => studioActions.setActiveNavTab('models');
const handleSetSplit = () => studioActions.setComparisonViewMode('split');
const handleSetSide = () => studioActions.setComparisonViewMode('side-by-side');

/**
 * Derives the throughput figure the overlay shows.
 *
 * Only reports what was actually measured. The backend supplies FPS for
 * video; for images it supplies none, and there is nothing to compute a
 * megapixel rate from unless the source dimensions were successfully
 * probed -- in which case the row shows no rate rather than one derived
 * from an assumed 1920x1080.
 */
function formatRate(
  fps: number | null,
  w: number | null,
  h: number | null,
  scale: number | null,
  progress: number,
  startedAtMs: number | null
): string {
  if (fps != null && fps > 0) return `${fps.toFixed(1)} FPS`;
  if (w == null || h == null || scale == null || startedAtMs == null || progress < 5) return '';

  const elapsedSec = (Date.now() - startedAtMs) / 1000;
  if (elapsedSec < 0.3) return '';
  const totalMp = (w * h * scale) / 1_000_000;
  const mps = (totalMp * (progress / 100)) / elapsedSec;
  return mps > 0 ? `${mps.toFixed(1)} MP/s` : '';
}

export const StudioControlsSection = memo(function StudioControlsSection() {
  const selected = useSelectedItem();
  const progressItem = useProgressItem();
  const isProc = useIsProcessing();
  const itemCount = useItemCount();
  const upscaledPath = useUpscaledPath();

  const scale = useScale();
  const tileSize = useTileSize();
  const isMuted = useIsMuted();

  const supportedModels = useSupportedModels();
  const installedModels = useInstalledModels();
  const selectedModel = useSelectedModel();
  const category = useCategory();

  const comparisonViewMode = useComparisonViewMode();
  const zoomLevel = useZoomLevel();

  const activeVramGb = useActiveVramGb();

  const outputDims = useMemo(
    () =>
      selected?.w != null && selected.h != null
        ? { w: selected.w * scale, h: selected.h * scale }
        : undefined,
    [selected?.w, selected?.h, scale]
  );

  const handleOpenOutput = useMemo(
    () => () => void showInExplorer(upscaledPath ?? ''),
    [upscaledPath]
  );

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
          onSelectCategory={selectCategory}
          installedModels={installedModels}
          selectedModel={selectedModel}
          onSelectModel={selectModel}
          scale={scale}
          onSelectScale={selectScale}
          isProcessing={isProc}
          hasFiles={itemCount > 0}
          isBatchMode={itemCount > 1}
          onRun={handleStartUpscale}
          onCancel={handleCancel}
          isMuted={isMuted}
          onToggleMute={studioActions.toggleMute}
          onOpenCatalog={handleOpenCatalog}
        />
      </div>

      {isProc && progressItem && (
        <ProgressOverlay
          percentage={progressItem.progress}
          statusText={progressItem.phase ?? undefined}
          phase={progressItem.status === 'queued' ? 'QUEUED' : 'UPSCALING'}
          etaSeconds={progressItem.etaSeconds ?? undefined}
          fps={progressItem.fps ?? undefined}
          rate={formatRate(
            progressItem.fps,
            progressItem.w,
            progressItem.h,
            progressItem.scale ?? scale,
            progressItem.progress,
            progressItem.startedAtMs
          )}
          vram={activeVramGb}
          tileCount={tileSize === 0 ? 'AUTO' : `${tileSize}px`}
          onCancel={handleCancel}
        />
      )}

      {upscaledPath && (
        <CompletionCard
          outputPath={upscaledPath}
          outputDims={outputDims}
          compareMode={comparisonViewMode === 'split' ? 'split' : 'side'}
          zoom={zoomLevel}
          onSetSplit={handleSetSplit}
          onSetSide={handleSetSide}
          onCycleZoom={studioActions.cycleZoom}
          onOpen={handleOpenOutput}
          onReset={clearFile}
        />
      )}
    </>
  );
});
