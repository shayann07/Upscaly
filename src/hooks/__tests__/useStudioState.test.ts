import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStudioState } from '../useStudioState';

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

  it('does not let unrelated toasts grow the array unboundedly', () => {
    const { result } = renderHook(() => useStudioState());

    act(() => {
      for (let i = 0; i < 5; i += 1) {
        result.current.handleNotify('info', `Title ${i}`, 'Body');
      }
    });
    expect(result.current.toasts).toHaveLength(5);

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.toasts).toHaveLength(0);
  });
});
