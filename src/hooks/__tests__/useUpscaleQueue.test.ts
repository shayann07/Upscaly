import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useUpscaleQueue } from '../useUpscaleQueue';

vi.mock('@tauri-apps/api/core', () => ({
  // run_upscale returns the job id together with the output path the backend
  // reserved -- the frontend no longer derives that path itself.
  invoke: vi.fn((cmd: string, args: { request?: { job_id?: string; input_path?: string } }) => {
    if (cmd === 'run_upscale') {
      const jobId = args?.request?.job_id || 'mock-job-id';
      return Promise.resolve({
        job_id: jobId,
        output_path: `C:/out/${jobId}_upscaled_4x.png`,
      });
    }
    return Promise.resolve(null);
  }),
}));

describe('useUpscaleQueue hook', () => {
  it('initializes with empty queue state', () => {
    const { result } = renderHook(() =>
      useUpscaleQueue({
        selectedGpu: 0,
        selectedModel: 'realesrgan-x4plus',
        scale: 4,
        tileSize: 0,
        customOutputPath: '',
      })
    );

    expect(result.current.batchItems).toEqual([]);
    expect(result.current.activeJobId).toBeNull();
    expect(result.current.isBatchRunning).toBe(false);
  });

  it('updates batch item status when job-status-changed progress arrives', async () => {
    const onItemCompleted = vi.fn();
    let result: { current: ReturnType<typeof useUpscaleQueue> };

    await act(async () => {
      const rendered = renderHook(() =>
        useUpscaleQueue({
          selectedGpu: 0,
          selectedModel: 'realesrgan-x4plus',
          scale: 4,
          tileSize: 0,
          customOutputPath: '',
          onItemCompleted,
        })
      );
      result = rendered.result;
    });

    act(() => {
      result!.current.setBatchItems([
        {
          id: 'job-1',
          filePath: 'C:/in.png',
          fileName: 'in.png',
          progress: 0,
          status: 'queued',
        },
      ]);
    });

    act(() => {
      result!.current.handleJobProgress({
        job_id: 'job-1',
        percentage: 50,
        status: 'processing',
      });
    });

    expect(result!.current.batchItems[0].progress).toBe(50);
    expect(result!.current.batchItems[0].status).toBe('processing');

    act(() => {
      result!.current.handleJobProgress({
        job_id: 'job-1',
        percentage: 100,
        status: 'completed',
        output_path: 'C:/out/in_upscaled_4x.png',
      });
    });

    expect(result!.current.batchItems[0].status).toBe('done');
    expect(result!.current.batchItems[0].outputPath).toBe('C:/out/in_upscaled_4x.png');
    expect(onItemCompleted).toHaveBeenCalled();
  });

  it('enqueues all ready items on startBatch and updates progress via events', async () => {
    let result: { current: ReturnType<typeof useUpscaleQueue> };

    await act(async () => {
      const rendered = renderHook(() =>
        useUpscaleQueue({
          selectedGpu: 0,
          selectedModel: 'realesrgan-x4plus',
          scale: 4,
          tileSize: 0,
          customOutputPath: '',
        })
      );
      result = rendered.result;
    });

    act(() => {
      result!.current.setBatchItems([
        {
          id: 'item-1',
          filePath: 'C:/img1.png',
          fileName: 'img1.png',
          progress: 0,
          status: 'ready',
        },
        {
          id: 'item-2',
          filePath: 'C:/img2.png',
          fileName: 'img2.png',
          progress: 0,
          status: 'ready',
        },
      ]);
    });

    await act(async () => {
      await result!.current.startBatch();
    });

    expect(result!.current.batchItems[0].status).toBe('queued');
    expect(result!.current.batchItems[1].status).toBe('queued');

    await act(async () => {
      result!.current.handleJobProgress({
        job_id: 'item-1',
        percentage: 50,
        status: 'running',
      });
    });

    expect(result!.current.activeJobId).toBe('item-1');
    expect(result!.current.batchItems[0].status).toBe('processing');

    await act(async () => {
      result!.current.handleJobProgress({
        job_id: 'item-1',
        percentage: 100,
        status: 'succeeded',
        output_path: 'C:/img1_upscaled_4x.png',
      });
    });

    expect(result!.current.batchItems[0].status).toBe('done');
  });
});

describe('useUpscaleQueue late/out-of-order events', () => {
  it('ignores a late/out-of-order event for an already-terminal item', async () => {
    const onItemCompleted = vi.fn();
    let result: { current: ReturnType<typeof useUpscaleQueue> };

    await act(async () => {
      const rendered = renderHook(() =>
        useUpscaleQueue({
          selectedGpu: 0,
          selectedModel: 'realesrgan-x4plus',
          scale: 4,
          tileSize: 0,
          customOutputPath: '',
          onItemCompleted,
        })
      );
      result = rendered.result;
    });

    act(() => {
      result!.current.setBatchItems([
        {
          id: 'job-1',
          filePath: 'C:/in.png',
          fileName: 'in.png',
          progress: 0,
          status: 'queued',
        },
      ]);
    });

    act(() => {
      result!.current.handleJobProgress({
        job_id: 'job-1',
        percentage: 100,
        status: 'cancelled',
      });
    });
    expect(result!.current.batchItems[0].status).toBe('cancelled');

    // A stale "running" tick for the same job arrives after cancellation
    // was already recorded -- it must not resurrect the row.
    act(() => {
      result!.current.handleJobProgress({
        job_id: 'job-1',
        percentage: 42,
        status: 'running',
      });
    });
    expect(result!.current.batchItems[0].status).toBe('cancelled');
    expect(result!.current.batchItems[0].progress).toBe(100);

    // Nor a stale "succeeded" -- which would otherwise both flip the row
    // and record an incorrect history entry for a job that was cancelled.
    act(() => {
      result!.current.handleJobProgress({
        job_id: 'job-1',
        percentage: 100,
        status: 'succeeded',
        output_path: 'C:/out/in_upscaled_4x.png',
      });
    });
    expect(result!.current.batchItems[0].status).toBe('cancelled');
    expect(onItemCompleted).not.toHaveBeenCalled();
  });
});
