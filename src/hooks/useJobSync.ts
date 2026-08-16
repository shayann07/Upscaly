import { useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { JobSnapshot } from '../lib/ipc';
import { JobState, isTerminalState } from '../lib/jobState';
import { addHistoryItem, mergeBackendHistory } from '../lib/history';
import { allowMediaPath } from '../lib/assetScope';
import { playCompleteSound, playErrorSound } from '../lib/sound';
import { QueueItem } from '../store/queueItem';
import { checkResumableJobs, refreshCatalog } from '../store/studioCommands';
import { studioActions, studioStore } from '../store/studioStore';
import { useJobEvents } from './useJobEvents';

/**
 * Which item the studio should follow, or `null` to leave the selection be.
 *
 * A finished item must not steal the view from one still working.
 * Previously the selection simply stayed put, so the instant image 1 of a
 * batch finished the studio swapped to its completion card while images 2
 * and 3 upscaled invisibly behind it. Focus follows the work; the finished
 * item stays one click away in the queue.
 *
 * Only ever moves *off* a terminal row -- a selection the user made on a
 * live item is never overridden, and a queue where nothing is running is
 * left exactly as they left it.
 */
export function nextFocusAfterTerminal(
  items: QueueItem[],
  selectedId: string | null
): string | null {
  const selected = items.find((i) => i.id === selectedId);
  if (!selected || !isTerminalState(selected.status)) return null;
  const working = items.find((i) => i.status === 'running' || i.status === 'queued');
  return working ? working.id : null;
}

/**
 * Keeps the queue in step with the backend's job store.
 *
 * Two inputs, one destination: a snapshot on mount (so a reload, or a
 * listener attached a tick late, no longer loses jobs that are already
 * running) and the coalesced `jobs-delta` stream after that. Nothing else
 * in the app writes a backend-owned field.
 *
 * The side effects that used to be scattered through the event handler --
 * history writes, sounds, completion toasts -- happen here, driven off
 * observed *transitions* rather than off every event that mentions a
 * terminal state, so a redelivered delta cannot write the same history
 * entry twice.
 */
export function useJobSync() {
  const handleTerminal = useCallback((item: QueueItem, remainingActive: number, total: number) => {
    if (item.status === 'succeeded' && item.outputPath) {
      allowMediaPath(item.outputPath);
      // The model id, not its display name: every path writes the same
      // identifier for the same model, so entries cannot disagree with each
      // other and restoring one is an exact lookup.
      studioActions.setHistoryItems(
        addHistoryItem({
          fileName: item.fileName,
          originalPath: item.filePath,
          upscaledPath: item.outputPath,
          modelId: item.modelName ?? studioStore.getState().selectedModel,
          scale: item.scale ?? studioStore.getState().scale,
          isVideo: item.isVideo,
        })
      );
    }

    if (item.status === 'failed') {
      playErrorSound(studioStore.getState().isMuted);
      studioActions.notify(
        'error',
        'Upscaling Failed',
        item.error ?? 'Processing failed during sidecar execution.'
      );
      return;
    }

    // Announce completion once the run is actually over rather than once
    // per file -- a twenty-item batch should not play twenty chimes.
    if (item.status === 'succeeded' && remainingActive === 0) {
      playCompleteSound(studioStore.getState().isMuted);
      studioActions.notify(
        'success',
        total > 1 ? 'Batch Complete' : 'Upscaling Complete',
        total > 1 ? 'All items in queue have been processed.' : 'Enhanced output saved.'
      );
    }
  }, []);

  const handleJobsChanged = useCallback(
    (snapshots: JobSnapshot[]) => {
      const before = new Map<string, JobState>(
        studioStore.getState().items.map((item) => [item.id, item.status])
      );

      studioActions.applySnapshots(snapshots);

      const { items } = studioStore.getState();
      const remainingActive = items.filter((item) => !isTerminalState(item.status)).length;

      const nextFocus = nextFocusAfterTerminal(items, studioStore.getState().selectedId);
      if (nextFocus) studioActions.selectItem(nextFocus);

      for (const item of items) {
        const previous = before.get(item.id);
        // A row that appeared already-terminal (a snapshot for a job this
        // session never staged) is history, not something that just
        // happened, so it gets no toast and no chime.
        if (previous === undefined || previous === item.status) continue;
        if (!isTerminalState(item.status)) continue;
        handleTerminal(item, remainingActive, items.length);
      }
    },
    [handleTerminal]
  );

  const handleDownloadProgress = useCallback(
    (payload: { model_id: string; percentage: number }) => {
      studioActions.setDownloadingModelId(payload.model_id);
      studioActions.setDownloadProgress(payload.percentage);
    },
    []
  );

  const handleModelCatalogUpdated = useCallback(() => {
    void refreshCatalog();
  }, []);

  // Read the current state once at startup instead of waiting for the next
  // event to reveal it.
  useEffect(() => {
    invoke<JobSnapshot[]>('get_jobs_snapshot')
      .then((snapshots) => studioActions.applySnapshots(snapshots))
      .catch(() => {});

    // The backend's durable history has entries for jobs that finished
    // while no webview was watching -- a crash, a reload -- which are
    // exactly the entries localStorage is missing. Folding them in here is
    // the frontend half of the fix; writing them at the transition is the
    // backend half.
    invoke<Parameters<typeof mergeBackendHistory>[0]>('get_history_entries')
      .then((records) => studioActions.setHistoryItems(mergeBackendHistory(records)))
      .catch(() => {});

    // And ask what crashed work survived on disk, once per launch.
    void checkResumableJobs();
  }, []);

  useJobEvents(handleJobsChanged, handleDownloadProgress, handleModelCatalogUpdated);
}
