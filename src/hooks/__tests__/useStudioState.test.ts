import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStudioState } from '../useStudioState';
import { MAX_VISIBLE_TOASTS } from '../../lib/types';

describe('useStudioState toasts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('dedupes an identical notification while the first is still visible', () => {
    const { result } = renderHook(() => useStudioState());

    act(() => {
      result.current.handleNotify('info', 'Title', 'Body');
      result.current.handleNotify('info', 'Title', 'Body');
    });

    expect(result.current.toasts).toHaveLength(1);
  });

  it('auto-dismisses a toast after its lifetime elapses', () => {
    const { result } = renderHook(() => useStudioState());

    act(() => {
      result.current.handleNotify('info', 'Title', 'Body');
    });
    expect(result.current.toasts).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.toasts).toHaveLength(0);
  });

  it('allows an identical notification again once the prior toast expired', () => {
    const { result } = renderHook(() => useStudioState());

    act(() => {
      result.current.handleNotify('info', 'Title', 'Body');
    });
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.toasts).toHaveLength(0);

    act(() => {
      result.current.handleNotify('info', 'Title', 'Body');
    });
    expect(result.current.toasts).toHaveLength(1);
  });

  it('caps the store at the number of toasts that actually render', () => {
    const { result } = renderHook(() => useStudioState());

    act(() => {
      for (let i = 0; i < 5; i += 1) {
        result.current.handleNotify('info', `Title ${i}`, 'Body');
      }
    });
    // Only MAX_VISIBLE_TOASTS render, so the store must not retain the rest:
    // an entry the user cannot see must not linger in dedupe state.
    expect(result.current.toasts).toHaveLength(MAX_VISIBLE_TOASTS);
    expect(result.current.toasts.map((t) => t.message)).toEqual([
      'Title 2: Body',
      'Title 3: Body',
      'Title 4: Body',
    ]);

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.toasts).toHaveLength(0);
  });

  it('does not let an evicted off-screen toast suppress a visible one', () => {
    const { result } = renderHook(() => useStudioState());

    // "Repeat" is pushed out of the visible window by the three that follow.
    act(() => {
      result.current.handleNotify('info', 'Repeat', 'Body');
      for (let i = 0; i < MAX_VISIBLE_TOASTS; i += 1) {
        result.current.handleNotify('info', `Filler ${i}`, 'Body');
      }
    });
    expect(result.current.toasts.some((t) => t.message === 'Repeat: Body')).toBe(false);

    // Re-notifying must now show it again. Previously the evicted-but-still-
    // stored copy matched the dedupe check and swallowed this silently.
    act(() => {
      result.current.handleNotify('info', 'Repeat', 'Body');
    });
    expect(result.current.toasts.some((t) => t.message === 'Repeat: Body')).toBe(true);
  });
});
