import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMediaSelection } from '../useMediaSelection';

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(() => Promise.resolve('C:/media/test_image.png')),
}));

vi.mock('../../lib/media', () => ({
  getMediaDimensions: vi.fn(() => Promise.resolve({ w: 1920, h: 1080 })),
  getMediaSrc: vi.fn((path: string) => path),
}));

vi.mock('../../lib/sound', () => ({
  playDropSound: vi.fn(),
}));

describe('useMediaSelection hook', () => {
  it('initializes with default empty media selection', () => {
    const { result } = renderHook(() => useMediaSelection(false, 'realesrgan-x4plus'));

    expect(result.current.filePath).toBe('');
    expect(result.current.fileName).toBe('');
    expect(result.current.isVideo).toBe(false);
    expect(result.current.batchItems).toEqual([]);
  });

  it('removes batch item by ID', () => {
    const { result } = renderHook(() => useMediaSelection(false, 'realesrgan-x4plus'));

    act(() => {
      result.current.setBatchItems([
        { id: '1', fileName: 'file1.png', progress: 0, status: 'ready' },
        { id: '2', fileName: 'file2.png', progress: 0, status: 'ready' },
      ]);
    });

    expect(result.current.batchItems.length).toBe(2);

    act(() => {
      result.current.handleRemoveBatchItem('1');
    });

    expect(result.current.batchItems.length).toBe(1);
    expect(result.current.batchItems[0].id).toBe('2');
  });

  it('opens file dialog and ingests selected file', async () => {
    const onNotify = vi.fn();
    const { result } = renderHook(() =>
      useMediaSelection(false, 'realesrgan-x4plus', undefined, onNotify)
    );

    await act(async () => {
      await result.current.handleOpenFile();
    });

    expect(result.current.filePath).toBe('C:/media/test_image.png');
    expect(result.current.fileName).toBe('test_image.png');
    expect(result.current.currentFileDims).toEqual({ w: 1920, h: 1080 });
    expect(onNotify).toHaveBeenCalledWith('info', 'File Loaded', 'test_image.png (1920×1080)');
  });
});
