import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import { useStudioContainerSetup } from '../useStudioContainerSetup';
import { jobSnapshot } from '../../test/jobSnapshot';
import { resetStudioStore, studioActions, studioStore } from '../../store/studioStore';

const listeners: Record<string, (event: { payload: unknown }) => void> = {};

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn((eventName: string, callback: (event: { payload: unknown }) => void) => {
    listeners[eventName] = callback;
    return Promise.resolve(() => {});
  }),
}));

vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({ onDragDropEvent: vi.fn().mockResolvedValue(() => {}) }),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue([]),
  convertFileSrc: (path: string) => `asset://${path}`,
}));

const mockInvoke = vi.mocked(invoke);
const state = () => studioStore.getState();

/**
 * The composition root had no test at all, which is precisely why the batch
 * bug survived: two hooks each owned a `batchItems` store, and a six-object
 * spread silently resolved the collision in favour of the empty one.
 *
 * There is no merged surface left to test -- state lives in the store. What
 * this covers instead is the wiring that replaced it: that mounting the app
 * reads the backend's snapshot, and that the delta stream reaches the queue.
 */
describe('studio container wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStudioStore();
    for (const key of Object.keys(listeners)) delete listeners[key];
    mockInvoke.mockResolvedValue([]);
  });

  it('reads the backend job snapshot on mount instead of waiting for an event', async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'get_jobs_snapshot') {
        return Promise.resolve([
          jobSnapshot({ job_id: 'already-running', status: 'running', percentage: 40 }),
        ]);
      }
      return Promise.resolve([]);
    });

    renderHook(() => useStudioContainerSetup());

    // A job started before this webview existed (or before its listener
    // attached) used to be invisible until its next tick, and permanently
    // invisible if it had none left.
    await waitFor(() => expect(state().items).toHaveLength(1));
    expect(state().items[0].id).toBe('already-running');
    expect(state().items[0].progress).toBe(40);
  });

  it('routes a coalesced delta through to the queue', async () => {
    renderHook(() => useStudioContainerSetup());
    await waitFor(() => expect(listeners['jobs-delta']).toBeDefined());

    act(() => {
      studioActions.addFiles(
        [
          {
            id: 'job-1',
            filePath: 'C:/a.png',
            fileName: 'a.png',
            isVideo: false,
            w: null,
            h: null,
          },
        ],
        true
      );
    });

    act(() => {
      listeners['jobs-delta']({
        payload: {
          jobs: [jobSnapshot({ job_id: 'job-1', status: 'running', percentage: 50 })],
        },
      });
    });

    expect(state().items[0].status).toBe('running');
    expect(state().items[0].progress).toBe(50);
  });

  it('starts in a clean, idle state', async () => {
    const { result } = renderHook(() => useStudioContainerSetup());
    await waitFor(() => expect(result.current.isDragOver).toBe(false));

    expect(state().items).toEqual([]);
    expect(state().selectedId).toBeNull();
    expect(state().confirmCancelOpen).toBe(false);
  });
});
