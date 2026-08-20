import { useState, useCallback, useRef } from 'react';

/**
 * Provides a transient trigger state to pulse/bounce an updated setting control.
 * Returns `[isFlashing, triggerFlash]`.
 */
export function useFlashFeedback(durationMs = 400) {
  const [isFlashing, setIsFlashing] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerFlash = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsFlashing(true);
    timeoutRef.current = setTimeout(() => {
      setIsFlashing(false);
      timeoutRef.current = null;
    }, durationMs);
  }, [durationMs]);

  return [isFlashing, triggerFlash] as const;
}
