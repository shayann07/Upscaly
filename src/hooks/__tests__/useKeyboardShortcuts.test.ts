import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useKeyboardShortcuts } from '../useKeyboardShortcuts';

function pressEscape() {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
}

function baseOptions(overrides: Partial<Parameters<typeof useKeyboardShortcuts>[0]> = {}) {
  return {
    activeJobId: null,
    isBatchActive: false,
    confirmCancelOpen: false,
    batchItemsCount: 0,
    handleOpenFile: vi.fn(),
    handleStartBatchUpscale: vi.fn(),
    handleCancelUpscale: vi.fn(),
    requestCancelConfirmation: vi.fn(),
    handleDismissCancel: vi.fn(),
    handleToggleNavTab: vi.fn(),
    setActiveNavTab: vi.fn(),
    ...overrides,
  };
}

describe('useKeyboardShortcuts Escape handling', () => {
  it('dismisses the confirm dialog first when it is open, ignoring everything else', () => {
    const opts = baseOptions({
      confirmCancelOpen: true,
      isBatchActive: true,
      activeJobId: 'job-1',
    });
    renderHook(() => useKeyboardShortcuts(opts));

    pressEscape();

    expect(opts.handleDismissCancel).toHaveBeenCalledTimes(1);
    expect(opts.handleCancelUpscale).not.toHaveBeenCalled();
    expect(opts.requestCancelConfirmation).not.toHaveBeenCalled();
    expect(opts.setActiveNavTab).not.toHaveBeenCalled();
  });

  it('requests confirmation instead of cancelling instantly for a single-file job', () => {
    const opts = baseOptions({ activeJobId: 'job-1', isBatchActive: false });
    renderHook(() => useKeyboardShortcuts(opts));

    pressEscape();

    expect(opts.requestCancelConfirmation).toHaveBeenCalledTimes(1);
    expect(opts.handleCancelUpscale).not.toHaveBeenCalled();
  });

  it('cancels a running batch directly (no confirm dialog exists for batches yet)', () => {
    const opts = baseOptions({ activeJobId: 'job-1', isBatchActive: true });
    renderHook(() => useKeyboardShortcuts(opts));

    pressEscape();

    expect(opts.handleCancelUpscale).toHaveBeenCalledTimes(1);
    expect(opts.requestCancelConfirmation).not.toHaveBeenCalled();
  });

  it('closes the active nav tab when nothing is running', () => {
    const opts = baseOptions();
    renderHook(() => useKeyboardShortcuts(opts));

    pressEscape();

    expect(opts.setActiveNavTab).toHaveBeenCalledWith(null);
    expect(opts.handleCancelUpscale).not.toHaveBeenCalled();
    expect(opts.requestCancelConfirmation).not.toHaveBeenCalled();
  });
});
