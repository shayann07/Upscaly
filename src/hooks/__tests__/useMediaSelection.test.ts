import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { renderHook, act } from '@testing-library/react';
import { useMediaSelection } from '../useMediaSelection';
import { BatchItem } from '../../lib/types';

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

// batchItems now lives in the caller (useUpscaleQueue in the real app), so
// tests supply their own store the same way useStudioContainerSetup does.
function useHarness(
  isMuted: boolean,
  selectedModel: string,
  onCategorySelect?: (cat: 'photos' | 'anime' | 'video') => void,
  onNotify?: (
    type: 'success' | 'error' | 'info' | 'warning',
    title: string,
    message: string
  ) => void
) {
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const media = useMediaSelection({
    isMuted,
    selectedModel,
    setBatchItems,
    onCategorySelect,
    onNotify,
  });
  return { ...media, batchItems };
}

describe('useMediaSelection hook', () => {
  it('initializes with default empty media selection', () => {
    const { result } = renderHook(() => useHarness(false, 'realesrgan-x4plus'));

    expect(result.current.filePath).toBe('');
    expect(result.current.fileName).toBe('');
    expect(result.current.isVideo).toBe(false);
    expect(result.current.batchItems).toEqual([]);
  });

  it('opens file dialog and ingests selected file', async () => {
    const onNotify = vi.fn();
    const { result } = renderHook(() =>
      useHarness(false, 'realesrgan-x4plus', undefined, onNotify)
    );

    await act(async () => {
      await result.current.handleOpenFile();
    });

    expect(result.current.filePath).toBe('C:/media/test_image.png');
    expect(result.current.fileName).toBe('test_image.png');
    expect(result.current.currentFileDims).toEqual({ w: 1920, h: 1080 });
    expect(result.current.batchItems.length).toBe(1);
    expect(onNotify).toHaveBeenCalledWith('info', 'File Loaded', 'test_image.png (1920×1080)');
  });

  it('clears the file and empties the injected batch store', async () => {
    const { result } = renderHook(() => useHarness(false, 'realesrgan-x4plus'));

    await act(async () => {
      await result.current.handleOpenFile();
    });
    expect(result.current.batchItems.length).toBe(1);

    act(() => {
      result.current.handleClearFile();
    });

    expect(result.current.filePath).toBe('');
    expect(result.current.batchItems).toEqual([]);
  });
});
