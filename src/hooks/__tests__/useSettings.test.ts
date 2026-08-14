import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSettings } from '../useSettings';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn((cmd: string) => {
    if (cmd === 'list_gpus') {
      return Promise.resolve([{ id: 0, name: 'NVIDIA RTX 3050', detail: '8 GB' }]);
    }
    if (cmd === 'get_app_settings') {
      return Promise.resolve({
        default_gpu_id: 0,
        default_scale: 4,
        default_tile_size: 256,
        output_directory: 'C:/Outputs',
      });
    }
    if (cmd === 'get_default_output_dir') {
      return Promise.resolve('C:/Outputs');
    }
    return Promise.resolve(null);
  }),
}));

describe('useSettings hook', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('initializes default settings state', () => {
    const { result } = renderHook(() => useSettings());

    expect(result.current.selectedGpu).toBe(0);
    expect(result.current.scale).toBe(4);
    expect(result.current.tileSize).toBe(0);
    expect(result.current.isMuted).toBe(false);
  });

  it('toggles sound mute state and updates localStorage', () => {
    const { result } = renderHook(() => useSettings());

    act(() => {
      result.current.handleToggleMute();
    });

    expect(result.current.isMuted).toBe(true);
    expect(localStorage.getItem('upscaly_sound_muted')).toBe('true');

    act(() => {
      result.current.handleToggleMute();
    });

    expect(result.current.isMuted).toBe(false);
    expect(localStorage.getItem('upscaly_sound_muted')).toBe('false');
  });

  it('allows updating scale, tile size, and custom output path', () => {
    const { result } = renderHook(() => useSettings());

    act(() => {
      result.current.setScale(2);
      result.current.setTileSize(512);
      result.current.setCustomOutputPath('D:/Upscaled');
    });

    expect(result.current.scale).toBe(2);
    expect(result.current.tileSize).toBe(512);
    expect(result.current.customOutputPath).toBe('D:/Upscaled');
  });
});

describe('useSettings load/save race', () => {
  it('does not save until both GPU list and persisted settings have loaded', async () => {
    // Simulates list_gpus resolving well before get_app_settings -- the
    // exact ordering that used to fire a real save (via setSelectedGpu
    // triggering the save effect) with scale/tileSize/output_directory
    // still at their hardcoded defaults, clobbering the user's real saved
    // values before they'd even loaded.
    let resolveSettings: (v: unknown) => void = () => {};
    const settingsPromise = new Promise((resolve) => {
      resolveSettings = resolve;
    });

    const invokeMock = vi.fn((cmd: string, _args?: unknown) => {
      if (cmd === 'list_gpus') {
        return Promise.resolve([{ id: 0, name: 'NVIDIA RTX 3050', detail: '8 GB' }]);
      }
      if (cmd === 'get_app_settings') {
        return settingsPromise;
      }
      return Promise.resolve(null);
    });
    vi.doMock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));
    vi.resetModules();
    const { useSettings: freshUseSettings } = await import('../useSettings');

    const { result } = renderHook(() => freshUseSettings());

    // Let list_gpus resolve and setSelectedGpu fire, well before settings.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.selectedGpu).toBe(0);
    expect(invokeMock).not.toHaveBeenCalledWith('update_app_settings', expect.anything());

    // Now let get_app_settings resolve with real saved values.
    await act(async () => {
      resolveSettings({
        default_gpu_id: 0,
        default_scale: 3,
        default_tile_size: 384,
        output_directory: 'C:/Real/Saved/Path',
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.scale).toBe(3);
    expect(result.current.tileSize).toBe(384);
    expect(result.current.customOutputPath).toBe('C:/Real/Saved/Path');

    // Any save that fires from here on must carry the real loaded values,
    // never a mix of the loaded GPU id with still-default scale/tileSize.
    const saveCalls = invokeMock.mock.calls.filter(([cmd]) => cmd === 'update_app_settings');
    for (const [, args] of saveCalls) {
      expect((args as { settings: { default_scale: number } }).settings.default_scale).toBe(3);
    }

    vi.doUnmock('@tauri-apps/api/core');
  });
});
