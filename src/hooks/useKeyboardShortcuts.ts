import { useEffect } from 'react';

interface KeyboardShortcutsOptions {
  activeJobId: string | null;
  isBatchActive: boolean;
  confirmCancelOpen: boolean;
  batchItemsCount: number;
  handleOpenFile: () => void;
  handleStartBatchUpscale: () => void;
  handleCancelUpscale: () => void;
  requestCancelConfirmation: () => void;
  handleDismissCancel: () => void;
  handleToggleNavTab: (tab: 'models' | 'history' | 'settings' | 'about') => void;
  setActiveNavTab: (tab: 'models' | 'history' | 'settings' | 'about' | null) => void;
}

export function useKeyboardShortcuts({
  activeJobId,
  isBatchActive,
  confirmCancelOpen,
  batchItemsCount,
  handleOpenFile,
  handleStartBatchUpscale,
  handleCancelUpscale,
  requestCancelConfirmation,
  handleDismissCancel,
  handleToggleNavTab,
  setActiveNavTab,
}: KeyboardShortcutsOptions) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput =
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          (activeEl as HTMLElement).isContentEditable);

      if (isInput) return;

      const key = e.key.toLowerCase();
      const isCmd = e.metaKey || e.ctrlKey;

      if (isCmd && key === 'o') {
        e.preventDefault();
        handleOpenFile();
        return;
      }

      if (isCmd && e.key === 'Enter') {
        e.preventDefault();
        if (batchItemsCount > 0) handleStartBatchUpscale();
        return;
      }

      if (e.key === 'Escape') {
        if (confirmCancelOpen) {
          // Close the topmost overlay first -- previously Escape fell
          // through to the cancel/nav-close branch below even while the
          // confirm dialog was open, instead of dismissing the dialog.
          handleDismissCancel();
        } else if (isBatchActive) {
          // No confirm dialog exists for batch cancellation yet, so this
          // matches the batch Cancel button's own (also ungated) behavior.
          handleCancelUpscale();
        } else if (activeJobId) {
          // Route through the same confirm dialog the "X" button uses,
          // instead of instantly killing a possibly hour-long job on an
          // accidental keypress.
          requestCancelConfirmation();
        } else {
          setActiveNavTab(null);
        }
        return;
      }

      if (isCmd && key === 's') {
        e.preventDefault();
        handleToggleNavTab('settings');
        return;
      }

      if (isCmd && key === 'h') {
        e.preventDefault();
        handleToggleNavTab('history');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    activeJobId,
    isBatchActive,
    confirmCancelOpen,
    batchItemsCount,
    handleOpenFile,
    handleStartBatchUpscale,
    handleCancelUpscale,
    requestCancelConfirmation,
    handleDismissCancel,
    handleToggleNavTab,
    setActiveNavTab,
  ]);
}
