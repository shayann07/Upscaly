import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useKeyboardShortcuts } from '../useKeyboardShortcuts';

function pressEscape() {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
}

function baseOptions(overrides: Partial<Parameters<typeof useKeyboardShortcuts>[0]> = {}) {
  return {
    hasActiveJob: false,
    confirmCancelOpen: false,
    itemCount: 0,
    handleOpenFile: vi.fn(),
    handleStartUpscale: vi.fn(),
    requestCancelConfirmation: vi.fn(),
    dismissCancelConfirmation: vi.fn(),
    toggleNavTab: vi.fn(),
    setActiveNavTab: vi.fn(),
    ...overrides,
  };
}

describe('useKeyboardShortcuts Escape handling', () => {
  it('dismisses the confirm dialog first when it is open, ignoring everything else', () => {
    const opts = baseOptions({ confirmCancelOpen: true, hasActiveJob: true });
    renderHook(() => useKeyboardShortcuts(opts));

    pressEscape();

    expect(opts.dismissCancelConfirmation).toHaveBeenCalledTimes(1);
    expect(opts.requestCancelConfirmation).not.toHaveBeenCalled();
    expect(opts.setActiveNavTab).not.toHaveBeenCalled();
  });

  it('requests confirmation instead of cancelling instantly', () => {
    const opts = baseOptions({ hasActiveJob: true });
    renderHook(() => useKeyboardShortcuts(opts));

    pressEscape();

    expect(opts.requestCancelConfirmation).toHaveBeenCalledTimes(1);
    expect(opts.setActiveNavTab).not.toHaveBeenCalled();
  });

  it('confirms batch cancellation too, rather than taking an ungated branch', () => {
    // Escape used to route a batch straight to cancellation with no dialog,
    // because batch and single-file cancellation were separate code paths.
    // They are one path now, so a twenty-item run is as hard to lose by
    // accident as a single one.
    const opts = baseOptions({ hasActiveJob: true, itemCount: 20 });
    renderHook(() => useKeyboardShortcuts(opts));

    pressEscape();

    expect(opts.requestCancelConfirmation).toHaveBeenCalledTimes(1);
  });

  it('closes the active nav tab when nothing is running', () => {
    const opts = baseOptions();
    renderHook(() => useKeyboardShortcuts(opts));

    pressEscape();

    expect(opts.setActiveNavTab).toHaveBeenCalledWith(null);
    expect(opts.requestCancelConfirmation).not.toHaveBeenCalled();
  });

  it('reads the latest options without re-attaching the listener', () => {
    const opts = baseOptions();
    const { rerender } = renderHook((props: typeof opts) => useKeyboardShortcuts(props), {
      initialProps: opts,
    });

    // The listener is attached once and reads through a ref. Values change
    // on every progress tick; tearing down and re-adding a window listener
    // that often is pure waste.
    const updated = { ...opts, hasActiveJob: true };
    rerender(updated);
    pressEscape();

    expect(updated.requestCancelConfirmation).toHaveBeenCalledTimes(1);
  });
});
