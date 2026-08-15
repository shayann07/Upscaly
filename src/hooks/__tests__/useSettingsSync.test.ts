import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import { useSettingsSync } from '../useSettingsSync';
import { resetStudioStore, studioStore } from '../../store/studioStore';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  convertFileSrc: (path: string) => `asset://${path}`,
}));

const mockInvoke = vi.mocked(invoke);
const state = () => studioStore.getState();

const SAVED = {
  default_gpu_id: 1,
  default_scale: 2,
  default_tile_size: 256,
  output_directory: 'D:/renders',
  sound_muted: true,
  auto_check_updates: false,
};

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  resetStudioStore();
  mockInvoke.mockReset();
  localStorage.clear();
});

describe('useSettingsSync', () => {
  it('restores every saved preference into the store', async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'list_gpus') return Promise.resolve([{ id: 1, name: 'RTX 3050', detail: '' }]);
      if (cmd === 'get_app_settings') return Promise.resolve(SAVED);
      return Promise.resolve([]);
    });

    renderHook(() => useSettingsSync());

    await waitFor(() => expect(state().settingsLoaded).toBe(true));
    expect(state().selectedGpu).toBe(1);
    expect(state().scale).toBe(2);
    expect(state().tileSize).toBe(256);
    expect(state().customOutputPath).toBe('D:/renders');
    expect(state().isMuted).toBe(true);
    expect(state().autoCheckUpdates).toBe(false);
  });

  it('does not save until both the GPU list and saved settings have settled', async () => {
    const gpus = deferred<unknown>();
    const settings = deferred<unknown>();
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'list_gpus') return gpus.promise;
      if (cmd === 'get_app_settings') return settings.promise;
      return Promise.resolve([]);
    });

    renderHook(() => useSettingsSync());

    // list_gpus resolving first used to ungate the save effect on its own,
    // which then wrote the resolved GPU paired with still-default scale,
    // tile size and output directory -- clobbering the user's real saved
    // preferences before they had even been read.
    gpus.resolve([{ id: 1, name: 'RTX 3050', detail: '' }]);
    await waitFor(() => expect(state().selectedGpu).toBe(1));
    expect(mockInvoke).not.toHaveBeenCalledWith('update_app_settings', expect.anything());

    settings.resolve(SAVED);
    await waitFor(() => expect(state().settingsLoaded).toBe(true));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith('update_app_settings', {
        settings: {
          default_gpu_id: 1,
          default_scale: 2,
          default_tile_size: 256,
          output_directory: 'D:/renders',
          sound_muted: true,
          auto_check_updates: false,
        },
      })
    );
  });

  it('persists the real toggle rather than a hardcoded value', async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'list_gpus') return Promise.resolve([]);
      if (cmd === 'get_app_settings') {
        return Promise.resolve({ ...SAVED, auto_check_updates: false });
      }
      return Promise.resolve([]);
    });

    renderHook(() => useSettingsSync());
    await waitFor(() => expect(state().settingsLoaded).toBe(true));

    await waitFor(() => {
      const saves = mockInvoke.mock.calls.filter(([cmd]) => cmd === 'update_app_settings');
      expect(saves.length).toBeGreaterThan(0);
      const last = saves[saves.length - 1][1] as { settings: { auto_check_updates: boolean } };
      expect(last.settings.auto_check_updates).toBe(false);
    });
  });
});
