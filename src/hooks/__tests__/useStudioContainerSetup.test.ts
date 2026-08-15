import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useStudioContainerSetup } from '../useStudioContainerSetup';
import type { BatchItem } from '../../lib/types';
import { jobSnapshot } from '../../test/jobSnapshot';

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({ onDragDropEvent: vi.fn().mockResolvedValue(() => {}) }),
}));

/**
 * The composition root had no test at all, which is precisely why the batch
 * bug survived: two hooks each owned a `batchItems` store, and the six-object
 * spread at the end of this hook silently resolved the collision in favour of
 * the empty one. Every symptom was in the wiring, not in either hook.
 *
 * These assertions are about that wiring -- ownership and identity of the
 * merged surface -- rather than any individual hook's behaviour.
 */
describe('useStudioContainerSetup composition root', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes a single batchItems store that writes are visible through', async () => {
    const { result } = renderHook(() => useStudioContainerSetup());
    await waitFor(() => expect(result.current.batchItems).toEqual([]));

    const item: BatchItem = {
      id: 'item-1',
      filePath: 'C:/a.png',
      fileName: 'a.png',
      progress: 0,
      status: 'ready',
    };

    act(() => {
      result.current.setBatchItems([item]);
    });

    // If the spread order ever reintroduces a second store, the setter and
    // the getter end up on different objects and this reads back empty.
    expect(result.current.batchItems).toHaveLength(1);
    expect(result.current.batchItems[0].id).toBe('item-1');
  });

  it('routes a progress event for a queued item through to the merged state', async () => {
    const { result } = renderHook(() => useStudioContainerSetup());
    await waitFor(() => expect(result.current.batchItems).toEqual([]));

    act(() => {
      result.current.setBatchItems([
        {
          id: 'job-1',
          filePath: 'C:/a.png',
          fileName: 'a.png',
          progress: 0,
          status: 'queued',
        },
      ]);
    });

    act(() => {
      result.current.handleQueueJobProgress(
        jobSnapshot({ job_id: 'job-1', percentage: 50, status: 'running' })
      );
    });

    expect(result.current.batchItems[0].status).toBe('running');
    expect(result.current.batchItems[0].progress).toBe(50);
  });

  it('surfaces exactly one definition of each colliding key', async () => {
    const { result } = renderHook(() => useStudioContainerSetup());
    await waitFor(() => expect(result.current.batchItems).toEqual([]));

    // These are the identifiers most at risk of being defined by more than
    // one of the spread hooks. Asserting they are all callable/defined is a
    // cheap guard against a future hook quietly shadowing one with undefined.
    expect(typeof result.current.setBatchItems).toBe('function');
    expect(typeof result.current.handleStartUpscale).toBe('function');
    expect(typeof result.current.handleCancelUpscale).toBe('function');
    expect(typeof result.current.handleQueueJobProgress).toBe('function');
    expect(typeof result.current.setScale).toBe('function');
    expect(typeof result.current.handleSelectModel).toBe('function');
    expect(typeof result.current.handleLoadHistoryItem).toBe('function');
    expect(Array.isArray(result.current.batchItems)).toBe(true);
  });

  it('starts in a clean, idle state', async () => {
    const { result } = renderHook(() => useStudioContainerSetup());
    await waitFor(() => expect(result.current.batchItems).toEqual([]));

    expect(result.current.jobStatus).toBe('ready');
    expect(result.current.activeJobId).toBeNull();
    expect(result.current.isBatchRunning).toBe(false);
  });
});
