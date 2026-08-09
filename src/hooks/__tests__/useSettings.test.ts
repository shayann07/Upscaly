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
