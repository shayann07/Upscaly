import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useJobEvents } from '../useJobEvents';

const mockListeners: Record<string, (event: { payload: unknown }) => void> = {};
const mockUnlisten = vi.fn();

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn((eventName: string, callback: (event: { payload: unknown }) => void) => {
    mockListeners[eventName] = callback;
    return Promise.resolve(mockUnlisten);
  }),
}));

describe('useJobEvents hook', () => {
  it('registers job status and download progress listeners', async () => {
    const onJobStatusChanged = vi.fn();
    const onDownloadProgress = vi.fn();

    await act(async () => {
      renderHook(() => useJobEvents(onJobStatusChanged, onDownloadProgress));
    });

    expect(mockListeners['job-status-changed']).toBeDefined();
    expect(mockListeners['download-progress']).toBeDefined();

    act(() => {
      mockListeners['job-status-changed']({
        payload: {
          job_id: 'test-1',
          percentage: 50,
          status: 'processing',
          output_path: 'C:/out/test-1.png',
        },
      });
    });

    expect(onJobStatusChanged).toHaveBeenCalledWith({
      job_id: 'test-1',
      percentage: 50,
      status: 'processing',
      output_path: 'C:/out/test-1.png',
    });

    act(() => {
      mockListeners['download-progress']({
        payload: {
          model_id: 'realesrgan-x4plus',
          percentage: 80,
        },
      });
    });

    expect(onDownloadProgress).toHaveBeenCalledWith({
      model_id: 'realesrgan-x4plus',
      percentage: 80,
    });
  });

  it('refreshes the catalog when the backend reports it changed', async () => {
    const onModelCatalogUpdated = vi.fn();

    await act(async () => {
      renderHook(() => useJobEvents(undefined, undefined, onModelCatalogUpdated));
    });

    expect(mockListeners['model-catalog-updated']).toBeDefined();

    act(() => {
      mockListeners['model-catalog-updated']({ payload: undefined });
    });

    expect(onModelCatalogUpdated).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes listeners on unmount', async () => {
    const onJobStatusChanged = vi.fn();
    let unmountFn: () => void = () => {};

    await act(async () => {
      const { unmount } = renderHook(() => useJobEvents(onJobStatusChanged));
      unmountFn = unmount;
    });

    act(() => {
      unmountFn();
    });

    expect(mockUnlisten).toHaveBeenCalled();
  });
});
