import { JobSnapshot, OutputFormat, QualityPreset } from '../lib/ipc';
import { GpuInfo, ModelInfo, MAX_VISIBLE_TOASTS, SUPPORTED_MODELS } from '../lib/types';
import { getRecentHistory, HistoryItem } from '../lib/history';
import { isTerminalState } from '../lib/jobState';
import { createStore } from './createStore';
import { QueueItem, StagedFile, itemFromSnapshot, mergeSnapshot, stagedItem } from './queueItem';

export type NavTab = 'models' | 'history' | 'settings' | 'about';
export type Category = 'photos' | 'anime' | 'video';
export type ToastKind = 'success' | 'error' | 'info' | 'warning';
export type ComparisonViewMode = 'split' | 'side-by-side';

export interface Toast {
  id: string;
  type: ToastKind;
  message: string;
}

/** How long a toast stays on screen before it removes itself. */
export const TOAST_LIFETIME_MS = 5000;

export interface StudioState {
  /**
   * Every file the user has picked, submitted or not, in pick order. This
   * is both the batch queue and the single-file view's backing data -- a
   * "single file" is just a queue of one, which is why there is no longer a
   * separate `filePath`/`fileName`/`jobStatus` set of variables that had to
   * be kept consistent with it.
   */
  items: QueueItem[];
  /** The row the studio view is showing. */
  selectedId: string | null;

  gpus: GpuInfo[];
  selectedGpu: number;
  scale: number;
  /** 0 = AUTO; the backend decides the real tile size. */
  tileSize: number;
  /**
   * Quality/Balanced/Speed. Proposes a tile size and decides whether TTA is
   * used; the backend's VRAM governor still has the last word on the tile,
   * and an explicit `tileSize` above still overrides the proposal.
   */
  preset: QualityPreset;
  /**
   * Container for image results. Video is always MP4 and ignores this.
   * PNG by default: it is the only lossless choice, and re-encoding a
   * finished upscale is the exact failure this work started from.
   */
  outputFormat: OutputFormat;
  /**
   * A folder of user-supplied ncnn `.param`+`.bin` pairs, searched in
   * addition to the app's own. Empty when unset.
   */
  customModelsDir: string;
  customOutputPath: string;
  isMuted: boolean;
  autoCheckUpdates: boolean;
  settingsLoaded: boolean;

  supportedModels: ModelInfo[];
  installedModels: string[];
  selectedModel: string;
  downloadingModelId: string | null;
  downloadProgress: number;

  category: Category;
  activeNavTab: NavTab | null;
  comparisonViewMode: ComparisonViewMode;
  zoomLevel: number;
  confirmCancelOpen: boolean;
  toasts: Toast[];
  historyItems: HistoryItem[];

  /**
   * VRAM figures, mirrored from the backend's profile. Rendered as-is;
   * the backend owns this number and the frontend never derives one.
   */
  activeVramGb: string;
  isVramOverflowing: boolean;
  /**
   * The tile size that will actually run, after the VRAM governor has had
   * its say -- which is not always `tileSize`. Selecting 512 at 4x on a 6GB
   * card clamps to 384, and the progress overlay used to keep reporting
   * "TILE 512px" throughout, describing a configuration that was never
   * executed. Null until the backend has answered.
   */
  effectiveTileSize: number | null;
}

function createInitialState(): StudioState {
  return {
    items: [],
    selectedId: null,

    gpus: [],
    selectedGpu: 0,
    scale: 4,
    tileSize: 0,
    preset: 'balanced',
    outputFormat: 'png',
    customModelsDir: '',
    customOutputPath: '',
    isMuted: localStorage.getItem('upscaly_sound_muted') === 'true',
    autoCheckUpdates: true,
    settingsLoaded: false,

    supportedModels: SUPPORTED_MODELS,
    installedModels: [],
    selectedModel: 'realesrgan-x4plus',
    downloadingModelId: null,
    downloadProgress: 0,

    category: 'photos',
    activeNavTab: null,
    comparisonViewMode: 'split',
    zoomLevel: 1,
    confirmCancelOpen: false,
    toasts: [],
    historyItems: getRecentHistory(),

    activeVramGb: '—',
    isVramOverflowing: false,
    effectiveTileSize: null,
  };
}

export const studioStore = createStore<StudioState>(createInitialState());

/** Returns the store to its launch state. For tests only. */
export function resetStudioStore() {
  studioStore.setState(createInitialState);
}

const { getState, setState } = studioStore;

function updateItem(id: string, change: (item: QueueItem) => QueueItem) {
  setState((prev) => {
    const index = prev.items.findIndex((item) => item.id === id);
    if (index === -1) return prev;
    const next = change(prev.items[index]);
    if (next === prev.items[index]) return prev;
    const items = [...prev.items];
    items[index] = next;
    return { ...prev, items };
  });
}

let toastSeq = 0;

/**
 * Everything that mutates the studio.
 *
 * Defined once at module scope, so every one of these has a stable identity
 * for the life of the app. That is what makes `React.memo` on the leaf
 * components meaningful: a component whose props are these functions plus
 * primitives genuinely does not re-render when something unrelated changes,
 * where previously every action was a fresh closure per render.
 */
export const studioActions = {
  // ---------------------------------------------------------------- queue

  /**
   * Adds newly picked files. A single pick replaces the queue (opening one
   * file means working on that file); a multi-pick appends, so a batch can
   * be assembled across several dialogs.
   */
  addFiles(files: StagedFile[], replace: boolean) {
    if (files.length === 0) return;
    const staged = files.map(stagedItem);
    setState((prev) => ({
      ...prev,
      items: replace ? staged : [...prev.items, ...staged],
      selectedId: replace ? staged[0].id : (prev.selectedId ?? staged[0].id),
    }));
  },

  selectItem(id: string | null) {
    setState((prev) => ({ ...prev, selectedId: id }));
  },

  removeItem(id: string) {
    setState((prev) => {
      const items = prev.items.filter((item) => item.id !== id);
      return {
        ...prev,
        items,
        selectedId: prev.selectedId === id ? (items[0]?.id ?? null) : prev.selectedId,
      };
    });
  },

  clearQueue() {
    setState((prev) => ({ ...prev, items: [], selectedId: null, confirmCancelOpen: false }));
  },

  /**
   * Records the id and reserved output path the backend assigned to a
   * submitted item.
   *
   * The row's identity changes here: it was keyed by a locally generated id
   * until the backend accepted it, and is keyed by the job id afterwards, so
   * that every later delta finds it by that id alone.
   */
  markSubmitted(localId: string, jobId: string, outputPath: string) {
    setState((prev) => {
      const localIndex = prev.items.findIndex((item) => item.id === localId);
      if (localIndex === -1) return prev;

      // The backend registers a job and flushes its first delta before
      // `run_upscale` returns, so a snapshot keyed by the job id can reach
      // the queue before the caller has learned that id -- inserting a
      // second row for the same job. Fold it back in here rather than
      // leaving a duplicate: keep the staged row's slot in the queue and
      // its probed dimensions (which the backend does not have), and take
      // everything else from what the backend already reported.
      const duplicateIndex = prev.items.findIndex(
        (item, index) => index !== localIndex && item.id === jobId
      );
      const local = prev.items[localIndex];
      const duplicate = duplicateIndex === -1 ? null : prev.items[duplicateIndex];

      const merged: QueueItem = duplicate
        ? { ...duplicate, w: local.w, h: local.h }
        : { ...local, id: jobId, outputPath, status: 'queued' };

      const items = prev.items.filter((_, index) => index !== duplicateIndex);
      const targetIndex =
        duplicateIndex !== -1 && duplicateIndex < localIndex ? localIndex - 1 : localIndex;
      items[targetIndex] = merged;

      return {
        ...prev,
        items,
        // The row's identity just changed, so a selection pointing at the
        // old id has to follow it -- otherwise the studio view silently
        // falls back to showing the first row instead.
        selectedId: prev.selectedId === localId ? jobId : prev.selectedId,
      };
    });
  },

  /** Marks an item that never reached the backend at all. */
  markSubmitFailed(localId: string, message: string) {
    updateItem(localId, (item) => ({ ...item, status: 'failed', error: message }));
  },

  /**
   * Folds a batch of backend snapshots into the queue.
   *
   * The single write path for every backend-owned field. A snapshot for an
   * id the queue has never seen is inserted rather than dropped -- that is
   * what makes `get_jobs_snapshot()` on startup show jobs this session did
   * not start.
   */
  applySnapshots(snapshots: JobSnapshot[]) {
    if (snapshots.length === 0) return;
    setState((prev) => {
      let items = prev.items;
      let changed = false;

      for (const snapshot of snapshots) {
        const index = items.findIndex((item) => item.id === snapshot.job_id);
        if (index === -1) {
          if (!changed) {
            items = [...items];
            changed = true;
          }
          items.push(itemFromSnapshot(snapshot));
          continue;
        }
        const next = mergeSnapshot(items[index], snapshot);
        if (next === items[index]) continue;
        if (!changed) {
          items = [...items];
          changed = true;
        }
        items[index] = next;
      }

      if (!changed) return prev;
      return {
        ...prev,
        items,
        selectedId: prev.selectedId ?? items[0]?.id ?? null,
      };
    });
  },

  /** Replaces a row's probed source dimensions once they are known. */
  setItemDimensions(id: string, w: number | null, h: number | null) {
    updateItem(id, (item) => (item.w === w && item.h === h ? item : { ...item, w, h }));
  },

  // ------------------------------------------------------------- settings

  setGpus(gpus: GpuInfo[]) {
    setState((prev) => ({ ...prev, gpus }));
  },
  setSelectedGpu(selectedGpu: number) {
    setState((prev) => ({ ...prev, selectedGpu }));
  },
  setScale(scale: number) {
    setState((prev) => ({ ...prev, scale }));
  },
  setPreset(preset: QualityPreset) {
    setState((prev) => ({ ...prev, preset }));
  },
  setOutputFormat(outputFormat: OutputFormat) {
    setState((prev) => ({ ...prev, outputFormat }));
  },
  setCustomModelsDir(customModelsDir: string) {
    setState((prev) => ({ ...prev, customModelsDir }));
  },
  setTileSize(tileSize: number) {
    setState((prev) => ({ ...prev, tileSize }));
  },
  setCustomOutputPath(customOutputPath: string) {
    setState((prev) => ({ ...prev, customOutputPath }));
  },
  setAutoCheckUpdates(autoCheckUpdates: boolean) {
    setState((prev) => ({ ...prev, autoCheckUpdates }));
  },
  setSettingsLoaded(settingsLoaded: boolean) {
    setState((prev) => ({ ...prev, settingsLoaded }));
  },
  setMuted(isMuted: boolean) {
    localStorage.setItem('upscaly_sound_muted', String(isMuted));
    setState((prev) => ({ ...prev, isMuted }));
  },
  toggleMute() {
    studioActions.setMuted(!getState().isMuted);
  },

  // -------------------------------------------------------------- catalog

  setCatalog(supportedModels: ModelInfo[], installedModels: string[]) {
    setState((prev) => ({ ...prev, supportedModels, installedModels }));
  },
  setInstalledModels(installedModels: string[]) {
    setState((prev) => ({ ...prev, installedModels }));
  },
  setSelectedModel(selectedModel: string) {
    setState((prev) => ({ ...prev, selectedModel }));
  },
  setDownloadingModelId(downloadingModelId: string | null) {
    setState((prev) => ({ ...prev, downloadingModelId }));
  },
  setDownloadProgress(downloadProgress: number) {
    setState((prev) => ({ ...prev, downloadProgress }));
  },

  // ------------------------------------------------------------------- ui

  setCategory(category: Category) {
    setState((prev) => ({ ...prev, category }));
  },
  setActiveNavTab(activeNavTab: NavTab | null) {
    setState((prev) => ({ ...prev, activeNavTab }));
  },
  toggleNavTab(tab: NavTab) {
    setState((prev) => ({ ...prev, activeNavTab: prev.activeNavTab === tab ? null : tab }));
  },
  setComparisonViewMode(comparisonViewMode: ComparisonViewMode) {
    setState((prev) => ({ ...prev, comparisonViewMode }));
  },
  setZoomLevel(zoomLevel: number) {
    setState((prev) => ({ ...prev, zoomLevel }));
  },
  cycleZoom() {
    setState((prev) => ({
      ...prev,
      zoomLevel: prev.zoomLevel === 1 ? 2 : prev.zoomLevel === 2 ? 4 : prev.zoomLevel === 4 ? 8 : 1,
    }));
  },
  setConfirmCancelOpen(confirmCancelOpen: boolean) {
    setState((prev) => ({ ...prev, confirmCancelOpen }));
  },
  setTelemetry(activeVramGb: string, isVramOverflowing: boolean, effectiveTileSize: number | null) {
    setState((prev) =>
      prev.activeVramGb === activeVramGb &&
      prev.isVramOverflowing === isVramOverflowing &&
      prev.effectiveTileSize === effectiveTileSize
        ? prev
        : { ...prev, activeVramGb, isVramOverflowing, effectiveTileSize }
    );
  },

  setHistoryItems(historyItems: HistoryItem[]) {
    setState((prev) => ({ ...prev, historyItems }));
  },

  /**
   * Shows a toast, deduped against what is currently on screen.
   *
   * The store is capped at what actually renders, so an off-screen entry
   * cannot match the dedupe check and silently swallow a notification the
   * user would otherwise have seen. Reading and writing here is synchronous
   * -- the previous version needed a parallel ref because React batches
   * `setState` updaters and runs them later, so the dedupe check read stale
   * data whenever two notifications fired in the same tick.
   */
  notify(type: ToastKind, title: string, message: string) {
    const text = message ? `${title}: ${message}` : title;
    if (getState().toasts.some((t) => t.message === text)) return;

    toastSeq += 1;
    const id = `toast-${toastSeq}`;
    setState((prev) => ({
      ...prev,
      toasts: [...prev.toasts, { id, type, message: text }].slice(-MAX_VISIBLE_TOASTS),
    }));
    setTimeout(() => studioActions.dismissToast(id), TOAST_LIFETIME_MS);
  },

  dismissToast(id: string) {
    setState((prev) => {
      const toasts = prev.toasts.filter((t) => t.id !== id);
      return toasts.length === prev.toasts.length ? prev : { ...prev, toasts };
    });
  },
};

/** Items that have not reached a terminal state. */
export function activeItems(state: StudioState): QueueItem[] {
  return state.items.filter((item) => !isTerminalState(item.status));
}
