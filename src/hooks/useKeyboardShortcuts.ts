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

function handleNavShortcuts(
  key: string,
  isCmd: boolean,
  toggleNavTab: (tab: NavTab) => void
): boolean {
  if (isCmd && key === 's') {
    toggleNavTab('settings');
    return true;
  }
  if (isCmd && key === 'h') {
    toggleNavTab('history');
    return true;
  }
  if (isCmd && key === 'm') {
    toggleNavTab('models');
    return true;
  }
  if ((isCmd && key === '/') || (key === '?' && !isCmd)) {
    toggleNavTab('about');
    return true;
  }
  return false;
}

function handleFileShortcuts(
  key: string,
  isCmd: boolean,
  shiftKey: boolean,
  options: KeyboardShortcutsOptions
): boolean {
  if (isCmd && shiftKey && key === 'o') {
    options.handleOpenFolder?.();
    return true;
  }
  if (isCmd && key === 'o') {
    options.handleOpenFile();
    return true;
  }
  if (isCmd && key === 'enter') {
    if (options.itemCount > 0) options.handleStartUpscale();
    return true;
  }
  return false;
}

function handleEscapeKey(options: KeyboardShortcutsOptions) {
  if (options.confirmCancelOpen) {
    options.dismissCancelConfirmation();
  } else if (options.hasActiveJob) {
    options.requestCancelConfirmation();
  } else {
    options.setActiveNavTab(null);
  }
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

      const opts = optionsRef.current;
      const key = e.key.toLowerCase();
      const isCmd = e.metaKey || e.ctrlKey;

      if (handleFileShortcuts(key, isCmd, e.shiftKey, opts)) {
        e.preventDefault();
        return;
      }

      if (e.key === 'Escape') {
        handleEscapeKey(opts);
        return;
      }

      if (handleNavShortcuts(key, isCmd, opts.toggleNavTab)) {
        e.preventDefault();
        return;
      }

      if (e.key === 'Delete' || (isCmd && e.key === 'Backspace')) {
        opts.handleRemoveSelected?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
