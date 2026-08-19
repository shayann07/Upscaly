import { JobState } from '../lib/jobState';
import { arrayEqual, useStoreValue } from './createStore';
import { QueueItem } from './queueItem';
import { StudioState, studioStore } from './studioStore';

/**
 * Selector hooks.
 *
 * Every selector is defined at module scope so its identity is stable --
 * `useStoreValue` caches on it, and an inline arrow would defeat that. A
 * component subscribes only to the slices it names, so a progress tick on
 * one queue row re-renders that row rather than the whole studio tree.
 */
function useSlice<T>(selector: (state: StudioState) => T, isEqual?: (a: T, b: T) => boolean): T {
  return useStoreValue(studioStore, selector, isEqual);
}

// ---------------------------------------------------------------- queue

const selectItems = (s: StudioState) => s.items;
const selectSelectedId = (s: StudioState) => s.selectedId;
const selectItemCount = (s: StudioState) => s.items.length;

export function selectSelectedItem(s: StudioState): QueueItem | null {
  if (!s.selectedId) return s.items[0] ?? null;
  return s.items.find((item) => item.id === s.selectedId) ?? null;
}

/**
 * The row the progress overlay follows: the selected one while it is still
 * running, otherwise whichever item is actually working. Selecting a queued
 * row mid-batch should not blank the overlay of the job in flight.
 */
export function selectProgressItem(s: StudioState): QueueItem | null {
  const selected = selectSelectedItem(s);
  if (selected?.status === 'running') return selected;
  return s.items.find((item) => item.status === 'running') ?? selected;
}

const selectIsProcessing = (s: StudioState) =>
  s.items.some((item) => item.status === 'running' || item.status === 'queued');

const selectHasActiveJob = (s: StudioState) =>
  s.items.some((item) => item.status === 'running' || item.status === 'queued');

export const useItems = () => useSlice(selectItems, arrayEqual);
export const useItemCount = () => useSlice(selectItemCount);
export const useSelectedId = () => useSlice(selectSelectedId);
export const useSelectedItem = () => useSlice(selectSelectedItem);
export const useProgressItem = () => useSlice(selectProgressItem);
export const useIsProcessing = () => useSlice(selectIsProcessing);
export const useHasActiveJob = () => useSlice(selectHasActiveJob);

/**
 * The studio view's status: whatever the selected file's job is doing, or
 * `ready` when it has no job yet. There is no separately-tracked
 * `jobStatus` any more -- it was a second copy of this, updated by its own
 * event handler, and the two disagreed whenever the user changed selection
 * while a job was running.
 */
const selectJobStatus = (s: StudioState): JobState => selectSelectedItem(s)?.status ?? 'ready';

/** The finished output of the selected file, or null if there isn't one. */
const selectUpscaledPath = (s: StudioState): string | null => {
  const item = selectSelectedItem(s);
  return item && item.status === 'succeeded' ? item.outputPath : null;
};

export const useJobStatus = () => useSlice(selectJobStatus);
export const useUpscaledPath = () => useSlice(selectUpscaledPath);

// ------------------------------------------------------------- settings

const selectGpus = (s: StudioState) => s.gpus;
const selectSelectedGpu = (s: StudioState) => s.selectedGpu;
const selectScale = (s: StudioState) => s.scale;
const selectTileSize = (s: StudioState) => s.tileSize;
const selectPreset = (s: StudioState) => s.preset;
const selectOutputFormat = (s: StudioState) => s.outputFormat;
const selectCustomModelsDir = (s: StudioState) => s.customModelsDir;
const selectGentleMode = (s: StudioState) => s.gentleMode;
const selectCustomOutputPath = (s: StudioState) => s.customOutputPath;
const selectIsMuted = (s: StudioState) => s.isMuted;
const selectActiveVramGb = (s: StudioState) => s.activeVramGb;
const selectIsVramOverflowing = (s: StudioState) => s.isVramOverflowing;
const selectEffectiveTileSize = (s: StudioState) => s.effectiveTileSize;

export const useGpus = () => useSlice(selectGpus, arrayEqual);
export const useSelectedGpu = () => useSlice(selectSelectedGpu);
export const useScale = () => useSlice(selectScale);
export const useTileSize = () => useSlice(selectTileSize);
export const usePreset = () => useSlice(selectPreset);
export const useOutputFormat = () => useSlice(selectOutputFormat);
export const useCustomModelsDir = () => useSlice(selectCustomModelsDir);
export const useGentleMode = () => useSlice(selectGentleMode);
export const useCustomOutputPath = () => useSlice(selectCustomOutputPath);
export const useIsMuted = () => useSlice(selectIsMuted);
export const useActiveVramGb = () => useSlice(selectActiveVramGb);
export const useIsVramOverflowing = () => useSlice(selectIsVramOverflowing);
export const useEffectiveTileSize = () => useSlice(selectEffectiveTileSize);

// -------------------------------------------------------------- updates

const selectAppName = (s: StudioState) => s.appName;
const selectAppVersion = (s: StudioState) => s.appVersion;
const selectAvailableUpdate = (s: StudioState) => s.availableUpdate;
const selectUpdatePhase = (s: StudioState) => s.updatePhase;
const selectUpdateProgress = (s: StudioState) => s.updateProgress;

export const useAppName = () => useSlice(selectAppName);
export const useAppVersion = () => useSlice(selectAppVersion);
export const useAvailableUpdate = () => useSlice(selectAvailableUpdate);
export const useUpdatePhase = () => useSlice(selectUpdatePhase);
export const useUpdateProgress = () => useSlice(selectUpdateProgress);

// -------------------------------------------------------------- catalog

const selectSupportedModels = (s: StudioState) => s.supportedModels;
const selectInstalledModels = (s: StudioState) => s.installedModels;
const selectSelectedModel = (s: StudioState) => s.selectedModel;
export const useSupportedModels = () => useSlice(selectSupportedModels, arrayEqual);
export const useInstalledModels = () => useSlice(selectInstalledModels, arrayEqual);
export const useSelectedModel = () => useSlice(selectSelectedModel);

const selectDownloadingModels = (s: StudioState) => s.downloadingModels;
/** Percentage per model id currently downloading -- see studioStore. */
export const useDownloadingModels = () => useSlice(selectDownloadingModels);

// ------------------------------------------------------------------- ui

const selectCategory = (s: StudioState) => s.category;
const selectActiveNavTab = (s: StudioState) => s.activeNavTab;
const selectComparisonViewMode = (s: StudioState) => s.comparisonViewMode;
const selectZoomLevel = (s: StudioState) => s.zoomLevel;
const selectConfirmCancelOpen = (s: StudioState) => s.confirmCancelOpen;
const selectConfirmSlowRunOpen = (s: StudioState) => s.confirmSlowRunOpen;
const selectResumableJobs = (s: StudioState) => s.resumableJobs;
const selectToasts = (s: StudioState) => s.toasts;
const selectHistoryItems = (s: StudioState) => s.historyItems;

export const useCategory = () => useSlice(selectCategory);
export const useActiveNavTab = () => useSlice(selectActiveNavTab);
export const useComparisonViewMode = () => useSlice(selectComparisonViewMode);
export const useZoomLevel = () => useSlice(selectZoomLevel);
export const useConfirmCancelOpen = () => useSlice(selectConfirmCancelOpen);
export const useConfirmSlowRunOpen = () => useSlice(selectConfirmSlowRunOpen);
export const useResumableJobs = () => useSlice(selectResumableJobs, arrayEqual);
export const useToasts = () => useSlice(selectToasts, arrayEqual);
export const useHistoryItems = () => useSlice(selectHistoryItems, arrayEqual);
