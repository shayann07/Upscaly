import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useJobEvents } from '../useJobEvents';
import { jobSnapshot } from '../../test/jobSnapshot';

const mockListeners: Record<string, (event: { payload: unknown }) => void> = {};
const mockUnlisten = vi.fn();

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn((eventName: string, callback: (event: { payload: unknown }) => void) => {
    mockListeners[eventName] = callback;
    return Promise.resolve(mockUnlisten);
  }),
}));

describe('useJobEvents hook', () => {
  it('registers job delta and download progress listeners', async () => {
    const onJobsChanged = vi.fn();
    const onDownloadProgress = vi.fn();

    await act(async () => {
      renderHook(() => useJobEvents(onJobsChanged, onDownloadProgress));
    });

    expect(mockListeners['jobs-delta']).toBeDefined();
    expect(mockListeners['download-progress']).toBeDefined();

    // One event carries every job that changed inside the backend's flush
    // window, so the handler is called once with the whole batch rather than
    // once per job.
    const jobs = [
      jobSnapshot({ job_id: 'test-1', percentage: 50, status: 'running' }),
      jobSnapshot({ job_id: 'test-2', status: 'queued' }),
    ];

    act(() => {
      mockListeners['jobs-delta']({ payload: { jobs } });
    });

    expect(onJobsChanged).toHaveBeenCalledTimes(1);
    expect(onJobsChanged).toHaveBeenCalledWith(jobs);

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
    const onJobsChanged = vi.fn();
    let unmountFn: () => void = () => {};

    await act(async () => {
      const { unmount } = renderHook(() => useJobEvents(onJobsChanged));
      unmountFn = unmount;
    });

    act(() => {
      unmountFn();
    });

    expect(mockUnlisten).toHaveBeenCalled();
  });
});
