import { useEffect } from 'react';

interface KeyboardShortcutsOptions {
  activeJobId: string | null;
  batchItemsCount: number;
  handleOpenFile: () => void;
  handleStartBatchUpscale: () => void;
  handleCancelUpscale: () => void;
  handleToggleNavTab: (tab: 'models' | 'history' | 'settings' | 'about') => void;
  setActiveNavTab: (tab: 'models' | 'history' | 'settings' | 'about' | null) => void;
}

export function useKeyboardShortcuts({
  activeJobId,
  batchItemsCount,
  handleOpenFile,
  handleStartBatchUpscale,
  handleCancelUpscale,
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
        if (activeJobId) handleCancelUpscale();
        else setActiveNavTab(null);
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
    batchItemsCount,
    handleOpenFile,
    handleStartBatchUpscale,
    handleCancelUpscale,
    handleToggleNavTab,
    setActiveNavTab,
  ]);
}
