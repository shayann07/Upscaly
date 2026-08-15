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

const NVIDIA = 'NVIDIA GeForce RTX 3050 6GB Laptop GPU';
const INTEL = 'Intel(R) UHD Graphics';

const SAVED = {
  default_gpu_id: 1,
  default_gpu_name: NVIDIA,
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
      if (cmd === 'list_gpus') {
        return Promise.resolve([{ id: 1, name: NVIDIA, detail: '' }]);
      }
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

  it('resolves the saved GPU by name against the current enumeration', async () => {
    // Vulkan handed out a different order this launch: the saved id of 1
    // now points at the Intel iGPU. Following the id would run the whole
    // job on integrated graphics with the UI still naming the NVIDIA.
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'list_gpus') {
        return Promise.resolve([
          { id: 0, name: NVIDIA, detail: '' },
          { id: 1, name: INTEL, detail: '' },
        ]);
      }
      if (cmd === 'get_app_settings') return Promise.resolve(SAVED);
      return Promise.resolve([]);
    });

    renderHook(() => useSettingsSync());
    await waitFor(() => expect(state().settingsLoaded).toBe(true));

    expect(state().selectedGpu).toBe(0);
    expect(state().gpus[state().selectedGpu].name).toBe(NVIDIA);
  });

  it('writes the device name back, not just the index', async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'list_gpus') {
        return Promise.resolve([{ id: 0, name: NVIDIA, detail: '' }]);
      }
      if (cmd === 'get_app_settings') return Promise.resolve(SAVED);
      return Promise.resolve([]);
    });

    renderHook(() => useSettingsSync());
    await waitFor(() => expect(state().settingsLoaded).toBe(true));

    await waitFor(() => {
      const saves = mockInvoke.mock.calls.filter(([cmd]) => cmd === 'update_app_settings');
      expect(saves.length).toBeGreaterThan(0);
      const last = saves[saves.length - 1][1] as {
        settings: { default_gpu_name: string | null };
      };
      // Without this the next launch has nothing but an index to go on,
      // which is the bug this whole path exists to close.
      expect(last.settings.default_gpu_name).toBe(NVIDIA);
    });
  });

  it('does not apply or save anything until both invokes have settled', async () => {
    const gpus = deferred<unknown>();
    const settings = deferred<unknown>();
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'list_gpus') return gpus.promise;
      if (cmd === 'get_app_settings') return settings.promise;
      return Promise.resolve([]);
    });

    renderHook(() => useSettingsSync());

    // These two used to race, each setting selectedGpu from its own effect,
    // so which card ran the job depended on which invoke returned first.
    // The GPU choice now needs both -- the enumeration to match against and
    // the saved name to match -- so it cannot be applied on this one alone.
    gpus.resolve([{ id: 0, name: NVIDIA, detail: '' }]);
    await waitFor(() => expect(state().gpus).toHaveLength(1));
    expect(state().settingsLoaded).toBe(false);
    expect(mockInvoke).not.toHaveBeenCalledWith('update_app_settings', expect.anything());

    settings.resolve(SAVED);
    await waitFor(() => expect(state().settingsLoaded).toBe(true));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith('update_app_settings', {
        settings: {
          default_gpu_id: 0,
          default_gpu_name: NVIDIA,
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
