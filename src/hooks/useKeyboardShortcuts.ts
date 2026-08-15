import { useEffect, useRef } from 'react';
import { NavTab } from '../store/studioStore';

interface KeyboardShortcutsOptions {
  hasActiveJob: boolean;
  confirmCancelOpen: boolean;
  itemCount: number;
  handleOpenFile: () => void;
  handleStartUpscale: () => void;
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
        handleStartUpscale,
        requestCancelConfirmation,
        dismissCancelConfirmation,
        toggleNavTab,
        setActiveNavTab,
      } = optionsRef.current;

      const key = e.key.toLowerCase();
      const isCmd = e.metaKey || e.ctrlKey;

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
          // Close the topmost overlay first -- previously Escape fell
          // through to the cancel/nav-close branch below even while the
          // confirm dialog was open, instead of dismissing the dialog.
          dismissCancelConfirmation();
        } else if (hasActiveJob) {
          // Route through the same confirm dialog the "X" button uses,
          // instead of instantly killing a possibly hour-long job on an
          // accidental keypress. This now covers batch runs too, which
          // previously took an ungated branch straight to cancellation.
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
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
