import { useEffect, useRef } from 'react';
import { NavTab } from '../store/studioStore';

interface KeyboardShortcutsOptions {
  hasActiveJob: boolean;
  confirmCancelOpen: boolean;
  itemCount: number;
  handleOpenFile: () => void;
  handleOpenFolder?: () => void;
  handleStartUpscale: () => void;
  handleRemoveSelected?: () => void;
  requestCancelConfirmation: () => void;
  dismissCancelConfirmation: () => void;
  toggleNavTab: (tab: NavTab) => void;
  setActiveNavTab: (tab: NavTab | null) => void;
}

export function useKeyboardShortcuts(options: KeyboardShortcutsOptions) {
  // The listener is attached once and reads the latest options through a
  // ref, rather than being torn down and re-attached every time a queue
  // item's progress changes the values it closes over.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput =
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          (activeEl as HTMLElement).isContentEditable);

      if (isInput) return;

      const {
        hasActiveJob,
        confirmCancelOpen,
        itemCount,
        handleOpenFile,
        handleOpenFolder,
        handleStartUpscale,
        handleRemoveSelected,
        requestCancelConfirmation,
        dismissCancelConfirmation,
        toggleNavTab,
        setActiveNavTab,
      } = optionsRef.current;

      const key = e.key.toLowerCase();
      const isCmd = e.metaKey || e.ctrlKey;

      if (isCmd && e.shiftKey && key === 'o') {
        e.preventDefault();
        handleOpenFolder?.();
        return;
      }

      if (isCmd && key === 'o') {
        e.preventDefault();
        handleOpenFile();
        return;
      }

      if (isCmd && e.key === 'Enter') {
        e.preventDefault();
        if (itemCount > 0) handleStartUpscale();
        return;
      }

      if (e.key === 'Escape') {
        if (confirmCancelOpen) {
          dismissCancelConfirmation();
        } else if (hasActiveJob) {
          requestCancelConfirmation();
        } else {
          setActiveNavTab(null);
        }
        return;
      }

      if (isCmd && key === 's') {
        e.preventDefault();
        toggleNavTab('settings');
        return;
      }

      if (isCmd && key === 'h') {
        e.preventDefault();
        toggleNavTab('history');
        return;
      }

      if (isCmd && key === 'm') {
        e.preventDefault();
        toggleNavTab('models');
        return;
      }

      if ((isCmd && key === '/') || (key === '?' && !isCmd)) {
        e.preventDefault();
        toggleNavTab('about');
        return;
      }

      if (e.key === 'Delete' || (isCmd && e.key === 'Backspace')) {
        handleRemoveSelected?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
