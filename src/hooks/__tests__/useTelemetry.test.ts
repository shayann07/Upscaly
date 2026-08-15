import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import * as core from '@tauri-apps/api/core';
import { useTelemetrySync } from '../useTelemetry';
import { resetStudioStore, studioActions, studioStore } from '../../store/studioStore';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

const state = () => studioStore.getState();

beforeEach(() => {
  resetStudioStore();
  vi.mocked(core.invoke).mockReset();
});

describe('useTelemetrySync', () => {
  it('mirrors the real backend VRAM profile instead of a fabricated estimate', async () => {
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
    studioActions.setTileSize(512);

    renderHook(() => useTelemetrySync());

    await waitFor(() => {
      expect(state().activeVramGb).toBe('3.4 GB');
      expect(state().isVramOverflowing).toBe(false);
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
    studioActions.setTileSize(999);

    renderHook(() => useTelemetrySync());

    await waitFor(() => expect(state().isVramOverflowing).toBe(true));
  });

  it('reports SYSTEM RAM for the CPU-fallback pseudo-GPU without querying VRAM', async () => {
    studioActions.setSelectedGpu(-1);

    renderHook(() => useTelemetrySync());

    await waitFor(() => expect(state().activeVramGb).toBe('SYSTEM RAM'));
    expect(state().isVramOverflowing).toBe(false);
    expect(core.invoke).not.toHaveBeenCalled();
  });

  it('shows a placeholder rather than a number the backend has not reported', () => {
    vi.mocked(core.invoke).mockReturnValue(new Promise(() => {}));

    renderHook(() => useTelemetrySync());

    expect(state().activeVramGb).toBe('—');
  });
});
