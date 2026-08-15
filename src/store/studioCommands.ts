import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { formatIpcError } from '../lib/appError';
import { allowMediaPath } from '../lib/assetScope';
import { HistoryEntry, ModelInfo, UpscaleJobHandle } from '../lib/types';
import { isTerminalState } from '../lib/jobState';
import { getMediaDimensions, getMediaSrc } from '../lib/media';
import { playDropSound } from '../lib/sound';
import { StagedFile } from './queueItem';
import { Category, StudioState, studioActions, studioStore } from './studioStore';

const MEDIA_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'mp4', 'mkv', 'mov', 'avi'];
const VIDEO_PATTERN = /\.(mp4|mkv|mov|avi)$/i;

const state = (): StudioState => studioStore.getState();

let localIdSeq = 0;
function nextLocalId(): string {
  localIdSeq += 1;
  return `staged-${localIdSeq}-${Date.now()}`;
}

// ----------------------------------------------------------------- files

/**
 * Ingests picked or dropped paths.
 *
 * Rows appear immediately with their dimensions still unknown, and each
 * probe fills in its own row as it resolves. Probing up front and waiting
 * for all of them meant one slow file held up the entire selection from
 * appearing at all.
 */
export async function ingestPaths(paths: string[]): Promise<void> {
  if (paths.length === 0) return;

  playDropSound(state().isMuted);

  const staged: StagedFile[] = paths.map((filePath) => ({
    id: nextLocalId(),
    filePath,
    fileName: filePath.split(/[\\/]/).pop() || 'media_file',
    isVideo: VIDEO_PATTERN.test(filePath),
    w: null,
    h: null,
  }));

  studioActions.addFiles(staged, paths.length === 1);

  if (paths.length === 1) {
    studioActions.setCategory(staged[0].isVideo ? 'video' : 'photos');
    studioActions.notify('info', 'File Loaded', staged[0].fileName);
  } else {
    studioActions.notify('info', 'Batch Loaded', `Added ${paths.length} files to queue.`);
  }

  await Promise.all(
    staged.map(async (file) => {
      // The asset protocol scope starts empty, so the preview would fail to
      // load and the probe below would see nothing without this.
      await allowMediaPath(file.filePath);
      const dims = await getMediaDimensions(getMediaSrc(file.filePath), file.isVideo);
      // Unknown stays null rather than becoming a plausible-looking
      // default: a fabricated 1920x1080 would be rendered as fact.
      studioActions.setItemDimensions(file.id, dims?.w ?? null, dims?.h ?? null);
    })
  );
}

export async function openFiles(): Promise<void> {
  try {
    const selected = await open({
      multiple: true,
      filters: [{ name: 'Media Files', extensions: MEDIA_EXTENSIONS }],
    });
    if (!selected) return;
    await ingestPaths(Array.isArray(selected) ? selected : [selected]);
  } catch (err) {
    console.error('Failed to select file:', err);
  }
}

export async function openFolder(): Promise<void> {
  try {
    const selected = await open({ directory: true, multiple: false });
    if (!selected || typeof selected !== 'string') return;
    await allowMediaPath(selected);
    await ingestPaths([selected]);
  } catch (err) {
    console.error('Failed to select folder:', err);
  }
}

export async function selectOutputDirectory(): Promise<void> {
  try {
    const selected = await open({ directory: true, multiple: false });
    if (selected && typeof selected === 'string') {
      await allowMediaPath(selected);
      studioActions.setCustomOutputPath(selected);
    }
  } catch (err) {
    console.error('Failed to select destination folder:', err);
  }
}

export function clearFile(): void {
  // A live job has to be dealt with before the queue it belongs to can be
  // thrown away, so route through the same confirmation the X button uses.
  if (hasActiveJob()) {
    studioActions.setConfirmCancelOpen(true);
    return;
  }
  studioActions.clearQueue();
  studioActions.notify('info', 'Queue Cleared', 'Ready for next input.');
}

// ------------------------------------------------------------------ jobs

function hasActiveJob(): boolean {
  return state().items.some((item) => item.status === 'running' || item.status === 'queued');
}

/**
 * Submits every item that is ready to run.
 *
 * A previously failed item is retryable, so it counts as ready. There is
 * one path here rather than a single-file one and a batch one: a single
 * file is a queue of one, and the backend serialises execution either way.
 */
export async function startUpscale(): Promise<void> {
  const snapshot = state();

  if (snapshot.gpus.length === 0) {
    studioActions.notify(
      'error',
      'No Vulkan GPU Found',
      'No Vulkan-compatible GPU detected. Please install updated graphics display drivers.'
    );
    return;
  }

  const pending = snapshot.items.filter(
    (item) => item.status === 'ready' || item.status === 'failed'
  );

  if (pending.length === 0) {
    studioActions.notify(
      'warning',
      snapshot.items.length === 0 ? 'No File Selected' : 'Queue Complete',
      snapshot.items.length === 0
        ? 'Please drag and drop or open an image/video first.'
        : 'All items in batch have already completed.'
    );
    return;
  }

  studioActions.notify(
    'info',
    pending.length > 1 ? 'Batch Started' : 'Upscaling Started',
    `Processing ${pending.length} item${pending.length > 1 ? 's' : ''}...`
  );

  for (const item of pending) {
    try {
      // The backend names and reserves the output and reports back where it
      // landed. It is the only thing that can guarantee two queued items
      // resolving to the same name each get a distinct one, so guessing the
      // path here could only ever disagree with reality.
      const handle = await invoke<UpscaleJobHandle>('run_upscale', {
        request: {
          job_id: null,
          input_path: item.filePath,
          output_dir: snapshot.customOutputPath || null,
          model_id: snapshot.selectedModel,
          gpu_id: snapshot.selectedGpu,
          scale: snapshot.scale,
          tile_size: snapshot.tileSize,
          is_video: item.isVideo,
        },
      });
      studioActions.markSubmitted(item.id, handle.job_id, handle.output_path);
    } catch (err) {
      console.error('Failed to start job:', err);
      studioActions.markSubmitFailed(item.id, formatIpcError(err));
      studioActions.notify('error', 'Error Starting Upscale', formatIpcError(err));
    }
  }
}

/** Stops one queued or running item. */
export async function cancelItem(id: string): Promise<void> {
  try {
    await invoke('cancel_upscale', { jobId: id });
  } catch (err) {
    console.error('Cancel failed for', id, err);
  }
}

/**
 * Stops everything still in flight.
 *
 * Cancel and Escape mean the same thing whether one file or twenty are
 * queued, so there is no longer a batch branch and a single-file branch
 * that could disagree about which job to reach.
 */
export async function cancelAll(): Promise<void> {
  const targets = state().items.filter((item) => !isTerminalState(item.status));
  if (targets.length === 0) return;
  await Promise.all(targets.map((item) => cancelItem(item.id)));
  studioActions.notify('info', 'Cancelled', 'Upscaling cancelled and resources freed.');
}

/** Opens the confirm dialog, but only when there is something to confirm. */
export function requestCancelConfirmation(): void {
  if (hasActiveJob()) studioActions.setConfirmCancelOpen(true);
}

export function dismissCancelConfirmation(): void {
  studioActions.setConfirmCancelOpen(false);
}

export async function confirmCancelAndClear(): Promise<void> {
  await cancelAll();
  studioActions.clearQueue();
  studioActions.notify(
    'info',
    'Upscale Cancelled',
    'Processing stopped and GPU resources released.'
  );
}

// -------------------------------------------------------- model / scale

function pickModel(models: ModelInfo[], installed: string[], predicate: (m: ModelInfo) => boolean) {
  const matches = models.filter(predicate);
  if (matches.length === 0) return null;
  return matches.find((m) => installed.length === 0 || installed.includes(m.id)) ?? matches[0];
}

export function selectCategory(cat: Category): void {
  studioActions.setCategory(cat);
  const { supportedModels, installedModels, scale } = state();
  const target = cat === 'photos' ? 'photo' : cat;

  const chosen =
    pickModel(supportedModels, installedModels, (m) => m.cat === target && m.scale === scale) ??
    pickModel(supportedModels, installedModels, (m) => m.cat === target);

  if (chosen) {
    studioActions.setSelectedModel(chosen.id);
    if (chosen.scale) studioActions.setScale(chosen.scale);
  }
}

export function selectModel(modelId: string): void {
  studioActions.setSelectedModel(modelId);
  const info = state().supportedModels.find((m) => m.id === modelId);
  if (!info) return;
  if (info.scale) studioActions.setScale(info.scale);
  studioActions.setCategory(info.cat === 'photo' ? 'photos' : info.cat);
}

/**
 * Changing the scale keeps the model consistent with it: models are
 * fixed-factor, so a 2x request cannot be served by the 4x model that
 * happens to be selected.
 */
export function selectScale(newScale: number): void {
  studioActions.setScale(newScale);
  const { supportedModels, installedModels, selectedModel } = state();
  const current = supportedModels.find((m) => m.id === selectedModel);
  if (!current || current.scale === newScale) return;

  const replacement =
    pickModel(
      supportedModels,
      installedModels,
      (m) => m.cat === current.cat && m.scale === newScale
    ) ?? pickModel(supportedModels, installedModels, (m) => m.scale === newScale);

  if (replacement) studioActions.setSelectedModel(replacement.id);
}

// --------------------------------------------------------------- history

export function loadHistoryItem(entry: HistoryEntry): void {
  // Entries can predate this app session, so the asset scope (in-memory,
  // reset each launch) will not include their paths yet even though they
  // were allowed when originally opened.
  allowMediaPath(entry.originalPath ?? '');
  allowMediaPath(entry.upscaledPath ?? '');

  if (entry.originalPath) {
    const id = nextLocalId();
    studioActions.addFiles(
      [
        {
          id,
          filePath: entry.originalPath,
          fileName: entry.fileName || entry.originalPath.split(/[\\/]/).pop() || '',
          isVideo: Boolean(entry.isVideo),
          w: entry.w ?? null,
          h: entry.h ?? null,
        },
      ],
      true
    );
    if (entry.upscaledPath) {
      // Restoring a finished result is an insert of an already-complete
      // row, not a state transition into one.
      studioStore.setState((prev) => ({
        ...prev,
        items: prev.items.map((item) =>
          item.id === id
            ? {
                ...item,
                status: 'succeeded' as const,
                progress: 100,
                outputPath: entry.upscaledPath ?? null,
                scale: entry.scale ?? null,
              }
            : item
        ),
      }));
    }
  }

  if (entry.scale) studioActions.setScale(entry.scale);

  // Entries record the model id, so restoring is an exact lookup rather
  // than a case-insensitive comparison of display strings the live catalog
  // could word differently. Older entries carry only a name.
  const { supportedModels } = state();
  const match =
    supportedModels.find((m) => entry.modelId && m.id === entry.modelId) ??
    supportedModels.find(
      (m) => entry.modelName && m.name.toLowerCase() === entry.modelName.toLowerCase()
    );
  if (match) studioActions.setSelectedModel(match.id);

  studioActions.setActiveNavTab(null);
}

// --------------------------------------------------------------- catalog

/**
 * Re-reads the model catalog from the backend.
 *
 * The backend owns the catalog; this only mirrors it. Called on startup and
 * whenever the backend reports the on-disk model set changed, which covers
 * changes this frontend did not initiate and would otherwise never see.
 */
export async function refreshCatalog(): Promise<void> {
  const reconcileSelection = (installed: string[]) => {
    if (installed.length > 0 && !installed.includes(state().selectedModel)) {
      studioActions.setSelectedModel(installed[0]);
    }
  };

  try {
    const catalog = await invoke<ModelInfo[]>('get_model_catalog');
    if (catalog && catalog.length > 0) {
      const installed = catalog.filter((m) => m.installed).map((m) => m.id);
      studioActions.setCatalog(catalog, installed);
      reconcileSelection(installed);
      return;
    }
  } catch {
    // Fall through to the plain installed-model list below.
  }

  try {
    const installed = await invoke<string[]>('list_installed_models');
    studioActions.setInstalledModels(installed);
    reconcileSelection(installed);
  } catch {
    // Leave the bundled catalog in place; nothing is installed yet.
  }
}

export async function downloadModel(modelId: string): Promise<void> {
  studioActions.setDownloadingModelId(modelId);
  studioActions.setDownloadProgress(0);
  try {
    // Each download streams progress for two files, so percentage resets
    // partway through and reaches 100 twice. This promise resolving -- once
    // both files are downloaded and verified -- is the only reliable
    // "finished" signal, which is why completion is handled here and not in
    // the progress event.
    await invoke('download_model', { modelId });
    studioActions.setDownloadProgress(100);
    await refreshCatalog();
    studioActions.notify('success', 'Model Installed', `${modelId} is ready for inference.`);
  } catch (err) {
    studioActions.notify('error', 'Download Failed', formatIpcError(err));
  } finally {
    studioActions.setDownloadingModelId(null);
  }
}

export async function showInExplorer(path: string): Promise<void> {
  if (!path) return;
  try {
    await revealItemInDir(path);
  } catch (err) {
    console.error('Failed to reveal file in explorer:', err);
  }
}
