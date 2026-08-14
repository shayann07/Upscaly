import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useVramProfile } from '../useVramProfile';
import * as core from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('useVramProfile hook', () => {
  it('queries authoritative VRAM profile from backend', async () => {
    vi.mocked(core.invoke).mockResolvedValueOnce({
      total_vram_mb: 6144,
      used_vram_mb: 3500,
      safe_tile_size: 512,
      auto_tile_size: 384,
      proc_threads: 1,
      thread_arg: '1:1:2',
      is_overflowing: false,
      status_message: 'Selected 512px tile (Single-Thread Safe Mode) · Projected: 3.4 GB / 6.0 GB.',
    });

    const { result } = renderHook(() => useVramProfile(1, 512));

    await waitFor(() => {
      expect(result.current.totalVramGb).toBe(6.0);
      expect(result.current.usedVramGb).toBeCloseTo(3.41, 1);
      expect(result.current.autoTileSize).toBe(384);
      expect(result.current.isOverflowing).toBe(false);
      expect(result.current.statusMessage).toContain('512px');
    });
  });
});
