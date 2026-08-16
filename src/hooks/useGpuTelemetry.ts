import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { GpuTelemetry } from '../lib/ipc';

const POLL_MS = 2000;

/**
 * Live NVIDIA readings while a job runs; `null` whenever idle or when there
 * is nothing to report.
 *
 * Polls only while `active` -- telemetry exists to answer "what is the GPU
 * doing under this load", and querying nvidia-smi every two seconds at idle
 * is cost without a question. An in-flight guard skips a tick rather than
 * stacking calls if one poll is slow, so a wedged driver produces a stale
 * reading, not a queue of them.
 *
 * Fields are individually optional and rendered as an em-dash when absent:
 * on most laptops the EC owns the fan, so `fan_pct` is `None` on exactly
 * the machines this feature was requested for. See the backend command for
 * why that is reported as unknown rather than zero.
 */
export function useGpuTelemetry(active: boolean): GpuTelemetry | null {
  const [telemetry, setTelemetry] = useState<GpuTelemetry | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    if (!active) {
      setTelemetry(null);
      return;
    }

    let cancelled = false;
    const poll = async () => {
      if (busyRef.current) return;
      busyRef.current = true;
      try {
        const reading = await invoke<GpuTelemetry>('get_gpu_telemetry');
        if (!cancelled) {
          // All-null means "no NVIDIA tooling answered" -- render nothing
          // rather than a row of dashes.
          const hasAnything = Object.values(reading).some((v) => v != null);
          setTelemetry(hasAnything ? reading : null);
        }
      } catch {
        if (!cancelled) setTelemetry(null);
      } finally {
        busyRef.current = false;
      }
    };

    void poll();
    const timer = setInterval(() => void poll(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [active]);

  return telemetry;
}
