import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { formatIpcError } from '../lib/appError';
import { allowMediaPath } from '../lib/assetScope';
import { HistoryEntry, ModelInfo, ResumableJob, UpscaleJobHandle } from '../lib/types';
import { isTerminalState } from '../lib/jobState';
import { QueueItem } from './queueItem';
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

  // Scope is granted *before* the rows render. The asset protocol's scope
  // starts empty, and adding first meant the thumbnail and canvas fired
  // their loads while the grant was still in flight -- a race the preview
  // lost often enough to show a broken image, and a failed <img> does not
  // retry when the scope later catches up.
  await Promise.all(staged.map((file) => allowMediaPath(file.filePath)));

  studioActions.addFiles(staged, paths.length === 1);

  if (paths.length === 1) {
    studioActions.setCategory(staged[0].isVideo ? 'video' : 'photos');
    studioActions.notify('info', 'File Loaded', staged[0].fileName);
  } else {
    studioActions.notify('info', 'Batch Loaded', `Added ${paths.length} files to queue.`);
  }

  await Promise.all(
    staged.map(async (file) => {
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

/**
 * Points the app at a folder of user-supplied ncnn models.
 *
 * The folder is remembered, not copied from: models stay where the user put
 * them, and the engine is pointed at that directory per job (see
 * `resolve_model_dir`). Passing an empty string clears the setting.
 */
export async function selectCustomModelsDir(): Promise<void> {
  try {
    const selected = await open({ directory: true, multiple: false });
    if (selected && typeof selected === 'string') {
      studioActions.setCustomModelsDir(selected);
      await refreshCatalog();
    }
  } catch (err) {
    console.error('Failed to select model folder:', err);
  }
}

export async function clearCustomModelsDir(): Promise<void> {
  studioActions.setCustomModelsDir('');
  await refreshCatalog();
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
/**
 * Asks the backend what crashed video work survived on disk. Called once at
 * launch; the scan is also the cleanup pass for unresumable debris, so it
 * runs even if the answer turns out to be empty.
 */
export async function checkResumableJobs(): Promise<void> {
  try {
    const jobs = await invoke<ResumableJob[]>('list_resumable_jobs');
    if (jobs.length > 0) studioActions.setResumableJobs(jobs);
  } catch (err) {
    console.error('Resumable-job scan failed:', err);
  }
}

/** Continues the currently offered crashed job from its surviving frames. */
export async function resumeOfferedJob(): Promise<void> {
  const offered = state().resumableJobs[0];
  studioActions.shiftResumableJob();
  if (!offered) return;
  try {
    // The input has to be readable through the asset protocol for the
    // preview, same as a freshly opened file.
    await allowMediaPath(offered.input_path);
    await invoke<UpscaleJobHandle>('resume_video_job', { jobId: offered.job_id });
    // The backend registers the job and its snapshot delta creates the
    // queue row -- nothing to stage locally.
    studioActions.notify(
      'info',
      'Resuming upscale',
      `${offered.file_name}: ${offered.frames_done} frames already done are kept.`
    );
  } catch (err) {
    studioActions.notify('error', 'Resume failed', formatIpcError(err));
  }
}

/** Declines the offered job for now; the folder stays for a later launch. */
export function dismissOfferedResume(): void {
  studioActions.shiftResumableJob();
}

/** Deletes the offered job's partial frames at the user's explicit request. */
export async function discardOfferedResume(): Promise<void> {
  const offered = state().resumableJobs[0];
  studioActions.shiftResumableJob();
  if (!offered) return;
  try {
    await invoke('discard_resumable_job', { jobId: offered.job_id });
  } catch (err) {
    console.error('Failed to discard partial work:', err);
  }
}

/**
 * Whether this run would enable TTA on a video.
 *
 * TTA runs every tile eight times. On a single image that is seconds; on a
 * 294-frame clip it is the difference between roughly an hour and roughly
 * eight, and there is nothing in a progress bar that distinguishes "slow
 * because you asked for eight passes" from "slow because something is
 * wrong". So it is confirmed before submitting rather than explained after.
 */
function needsSlowRunConfirmation(
  snapshot: ReturnType<typeof state>,
  pending: QueueItem[]
): boolean {
  return snapshot.preset === 'quality' && pending.some((item) => item.isVideo);
}

/** Proceeds with a run the user has now explicitly accepted the cost of. */
export async function confirmSlowRunAndStart(): Promise<void> {
  studioActions.setConfirmSlowRunOpen(false);
  await submitPending();
}

export function dismissSlowRunConfirmation(): void {
  studioActions.setConfirmSlowRunOpen(false);
}

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

  // Models are downloaded on demand rather than shipped, so "nothing is
  // installed yet" is the normal state of a fresh install, not an error
  // condition. Submitting anyway would spawn an engine that fails on a
  // missing .param file and surface as an opaque execution error, which is
  // a terrible first thing for a new user to see.
  if (snapshot.installedModels.length === 0) {
    studioActions.notify(
      'info',
      'No models installed yet',
      'Pick a model in the Models tab to download it. Around 34 MB, once.'
    );
    studioActions.setActiveNavTab('models');
    return;
  }
  if (!snapshot.installedModels.includes(snapshot.selectedModel)) {
    const name =
      snapshot.supportedModels.find((m) => m.id === snapshot.selectedModel)?.name ??
      snapshot.selectedModel;
    studioActions.notify('info', `${name} is not downloaded yet`, 'Download it to run this model.');
    studioActions.setActiveNavTab('models');
    return;
  }

  const pending = snapshot.items.filter(
    (item) => item.status === 'ready' || item.status === 'failed'
  );

  // On the engine's CPU path a single 1080p frame takes minutes, so a clip
  // of even a few hundred frames runs for days. Starting one would not be
  // "slow but working", it would be a job the user abandons hours later
  // having produced nothing -- so it is refused up front, while images are
  // still allowed through.
  if (snapshot.cpuOnly && pending.some((item) => item.isVideo)) {
    studioActions.notify(
      'error',
      'Video needs a GPU',
      'No compatible GPU was found, and CPU video upscaling would take days. Images still work. Installing or updating a Vulkan-capable graphics driver enables video.'
    );
    return;
  }

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

  if (needsSlowRunConfirmation(snapshot, pending)) {
    studioActions.setConfirmSlowRunOpen(true);
    return;
  }

  await submitPending();
}

/**
 * Sends every runnable item to the backend.
 *
 * Split out of startUpscale so the TTA-on-video confirmation can sit between
 * the two: the dialog's confirm button resumes here rather than re-entering
 * startUpscale, which would ask again.
 */
async function submitPending(): Promise<void> {
  const snapshot = state();
  const pending = snapshot.items.filter(
    (item) => item.status === 'ready' || item.status === 'failed'
  );
  if (pending.length === 0) return;

  if (pending.some((item) => item.isVideo)) {
    const ffmpegOk = await invoke<boolean>('ffmpeg_available').catch(() => true);
    if (!ffmpegOk) {
      studioActions.notify(
        'warning',
        'Video components missing',
        'Downloading ffmpeg (~290 MB)...'
      );
      try {
        await invoke('provision_ffmpeg');
        studioActions.notify('success', 'Video components ready', 'ffmpeg is installed.');
      } catch (provisionErr) {
        studioActions.notify(
          'error',
          'ffmpeg download failed',
          'Could not download ffmpeg for video upscaling: ' + formatIpcError(provisionErr)
        );
        return;
      }
    }
  }

  studioActions.notify(
    'info',
    pending.length > 1 ? 'Batch Started' : 'Upscaling Started',
    `Processing ${pending.length} item${pending.length > 1 ? 's' : ''}...`
  );

  try {
    // Submitted as one call, not one call per item. The queue starts the
    // first job the instant it is enqueued, so submitting serially would
    // mean no two images ever arrived close enough together to share an
    // NCNN process -- which is where the batch speedup comes from.
    //
    // The backend names and reserves each output and reports back where it
    // landed. It is the only thing that can guarantee two items resolving
    // to the same name each get a distinct one, so guessing the path here
    // could only ever disagree with reality.
    const handles = await invoke<UpscaleJobHandle[]>('run_upscale_batch', {
      requests: pending.map((item) => ({
        job_id: null,
        input_path: item.filePath,
        output_dir: snapshot.customOutputPath || null,
        model_id: snapshot.selectedModel,
        gpu_id: snapshot.selectedGpu,
        scale: snapshot.scale,
        tile_size: snapshot.tileSize,
        preset: snapshot.preset,
        output_format: snapshot.outputFormat,
        is_video: item.isVideo,
      })),
    });

    // Handles come back in the order they were sent.
    pending.forEach((item, index) => {
      const handle = handles[index];
      if (handle) studioActions.markSubmitted(item.id, handle.job_id, handle.output_path);
    });
  } catch (err) {
    console.error('Failed to start jobs:', err);
    const message = formatIpcError(err);
    for (const item of pending) studioActions.markSubmitFailed(item.id, message);
    studioActions.notify('error', 'Error Starting Upscale', message);
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

  // Only ever swap within the same category.
  //
  // This used to fall through to "any model at that factor", and since the
  // only 2x model in the catalog is realesr-animevideov3-x2, asking for 2x
  // on a photograph silently handed the job to an anime *video* model. The
  // job completed, the file appeared, and the result was flat, waxy skin --
  // a quality collapse with nothing anywhere reporting that the model had
  // been changed out from under the user.
  const replacement = pickModel(
    supportedModels,
    installedModels,
    (m) => m.cat === current.cat && m.scale === newScale
  );

  if (replacement) {
    studioActions.setSelectedModel(replacement.id);
    return;
  }

  // Nothing in this category runs at that factor. Keep the model -- it is
  // still the right one for this kind of image -- and say plainly what the
  // output will be, rather than substituting a model trained on something
  // else entirely just to make the number match.
  studioActions.notify(
    'info',
    `${current.name} outputs ${current.scale}×`,
    `No ${current.cat} model runs at ${newScale}×, so this stays on ${current.name}.`
  );
}

// --------------------------------------------------------------- history

export async function loadHistoryItem(entry: HistoryEntry): Promise<void> {
  // Entries can predate this app session, so the asset scope (in-memory,
  // reset each launch) will not include their paths yet even though they
  // were allowed when originally opened. Awaited before the rows render:
  // fired-and-forgotten, the previews raced the grant and a lost race is a
  // permanently broken thumbnail (a failed <img> does not retry).
  await Promise.all([
    allowMediaPath(entry.originalPath ?? ''),
    allowMediaPath(entry.upscaledPath ?? ''),
  ]);

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
    // Move to something runnable when the current pick is not installed.
    // With nothing installed at all there is nothing to move to, and the
    // selection is deliberately left alone: it is what the Models tab
    // highlights, and startUpscale routes the user there rather than
    // letting them press Run on a model that cannot execute.
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
  // The catalog's Download button is hidden while its own model is in
  // `downloadingModels`, so this only fires for a genuine double-trigger
  // (a stale click queued before the row re-rendered, or a caller other
  // than the button). Guarding here as well as in the UI matters because
  // the backend has no per-model lock of its own: two concurrent requests
  // for the same id would both write the same `.tmp` path.
  if (modelId in state().downloadingModels) return;

  studioActions.setModelDownloadProgress(modelId, 0);
  try {
    // Each download streams progress for two files, so percentage resets
    // partway through and reaches 100 twice. This promise resolving -- once
    // both files are downloaded and verified -- is the only reliable
    // "finished" signal, which is why completion is handled here and not in
    // the progress event.
    await invoke('download_model', { modelId });
    studioActions.setModelDownloadProgress(modelId, 100);
    await refreshCatalog();
    studioActions.notify('success', 'Model Installed', `${modelId} is ready for inference.`);
  } catch (err) {
    studioActions.notify('error', 'Download Failed', formatIpcError(err));
  } finally {
    studioActions.clearModelDownload(modelId);
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

export async function provisionFfmpeg(): Promise<void> {
  studioActions.notify('info', 'Downloading Video Components', 'Fetching ffmpeg (~290 MB)...');
  try {
    await invoke('provision_ffmpeg');
    studioActions.notify('success', 'Video Components Ready', 'ffmpeg installed successfully.');
  } catch (err) {
    studioActions.notify('error', 'Download Failed', formatIpcError(err));
  }
}
