import { renderHook, act } from '@testing-library/react';
import { useFlashFeedback } from '../useFlashFeedback';
import { describe, it, expect, vi } from 'vitest';

describe('useFlashFeedback', () => {
  it('triggers flash state and resets after duration', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useFlashFeedback(300));

    expect(result.current[0]).toBe(false);

    act(() => {
      result.current[1]();
    });

    expect(result.current[0]).toBe(true);

    act(() => {
      vi.advanceTimersByTime(350);
    });

    expect(result.current[0]).toBe(false);
    vi.useRealTimers();
  });
});
