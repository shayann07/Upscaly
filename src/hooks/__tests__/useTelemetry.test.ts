import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useTelemetry } from '../useTelemetry';
import * as core from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('useTelemetry hook', () => {
  it('reflects the real backend VRAM profile instead of a fabricated estimate', async () => {
    vi.mocked(core.invoke).mockResolvedValueOnce({
      total_vram_mb: 6144,
      used_vram_mb: 3500,
      safe_tile_size: 512,
      auto_tile_size: 384,
      proc_threads: 1,
      thread_arg: '1:1:2',
      is_overflowing: false,
      status_message: 'Selected 512px tile.',
    });

    const { result } = renderHook(() =>
      useTelemetry({ gpus: [], selectedGpu: 0, jobStatus: 'idle', tileSize: 512 })
    );

    await waitFor(() => {
      expect(result.current.activeVramGb).toBe('3.4 GB');
      expect(result.current.isVramOverflowing).toBe(false);
    });
  });

  it('can actually report overflow -- the old fabricated math could never do this', async () => {
    vi.mocked(core.invoke).mockResolvedValueOnce({
      total_vram_mb: 4096,
      used_vram_mb: 4800,
      safe_tile_size: 128,
      auto_tile_size: 128,
      proc_threads: 1,
      thread_arg: '1:1:1',
      is_overflowing: true,
      status_message: 'Over budget.',
    });

    const { result } = renderHook(() =>
      useTelemetry({ gpus: [], selectedGpu: 0, jobStatus: 'processing', tileSize: 999 })
    );

    await waitFor(() => {
      expect(result.current.isVramOverflowing).toBe(true);
    });
  });

  it('reports SYSTEM RAM for the CPU-fallback pseudo-GPU without querying VRAM', () => {
    const { result } = renderHook(() =>
      useTelemetry({ gpus: [], selectedGpu: -1, jobStatus: 'idle', tileSize: 0 })
    );

    expect(result.current.activeVramGb).toBe('SYSTEM RAM');
    expect(result.current.isVramOverflowing).toBe(false);
  });
});
