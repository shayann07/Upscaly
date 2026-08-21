import { useCallback } from 'react';
import { useJobSync } from './useJobSync';
import { useSettingsSync } from './useSettingsSync';
import { useTelemetrySync } from './useTelemetry';
import { useDragDrop } from './useDragDrop';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { studioActions, studioStore } from '../store/studioStore';
import { useConfirmCancelOpen, useHasActiveJob, useItemCount } from '../store/selectors';
import {
  dismissCancelConfirmation,
  ingestPaths,
  openFiles,
  openFolder,
  requestCancelConfirmation,
  startUpscale,
} from '../store/studioCommands';

/**
 * Mounts the app's background wiring.
 *
 * This used to be the composition root: it constructed six hooks and merged
 * them into one ~70-identifier object with six object spreads, whose
 * ordering silently resolved collisions -- which is how two `batchItems`
 * stores coexisted with the empty one winning, making batch mode
 * unreachable. It also needed four mutable ref bridges, because three of
 * those hooks each required a callback that lived on one of the others and
 * they could not all be constructed first.
 *
 * There is nothing left to merge. State lives in the store, actions are
 * module-scope functions, and components read the slices they need. What
 * remains here is the handful of effects that have to be attached to a
 * mounted component: the job/settings sync, drag-and-drop, and keyboard
 * shortcuts.
 */
export function useStudioContainerSetup() {
  useJobSync();
  useSettingsSync();
  useTelemetrySync();

  const { isDragOver } = useDragDrop(handleFilesDropped, studioActions.notify);

  const hasActiveJob = useHasActiveJob();
  const confirmCancelOpen = useConfirmCancelOpen();
  const itemCount = useItemCount();

  const handleStartUpscale = useCallback(() => {
    void startUpscale();
  }, []);
  const handleOpenFile = useCallback(() => {
    void openFiles();
  }, []);
  const handleOpenFolder = useCallback(() => {
    void openFolder();
  }, []);
  const handleRemoveSelected = useCallback(() => {
    const id = studioStore.getState().selectedId;
    if (id) studioActions.removeItem(id);
  }, []);

  useKeyboardShortcuts({
    hasActiveJob,
    confirmCancelOpen,
    itemCount,
    handleOpenFile,
    handleOpenFolder,
    handleStartUpscale,
    handleRemoveSelected,
    requestCancelConfirmation,
    dismissCancelConfirmation,
    toggleNavTab: studioActions.toggleNavTab,
    setActiveNavTab: studioActions.setActiveNavTab,
  });

  return { isDragOver };
}

function handleFilesDropped(paths: string[]) {
  void ingestPaths(paths);
}
