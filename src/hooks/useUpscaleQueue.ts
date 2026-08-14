import { useState, useCallback, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { BatchItem, JobProgress } from '../lib/types';
import { joinPath } from '../lib/outputPaths';

const TERMINAL_STATUSES = new Set(['done', 'error', 'cancelled']);

export interface UseUpscaleQueueOptions {
  selectedGpu: number;
  selectedModel: string;
  scale: number;
  tileSize: number;
  customOutputPath: string;
  onNotify?: (
    type: 'success' | 'error' | 'info' | 'warning',
    title: string,
    message: string
  ) => void;
  onItemCompleted?: (item: BatchItem, outputPath: string) => void;
}

function resolveOutputPath(item: BatchItem, scale: number, customOutputPath: string): string {
  const isVid = Boolean(item.isVideo);
  const ext = isVid ? '.mp4' : '.png';
  const fileName = item.fileName || 'media';
  const baseName = fileName.replace(/\.[^/.]+$/, '');
  const outputFilename = `${baseName}_upscaled_${scale}x${ext}`;

  if (customOutputPath) {
    return joinPath(customOutputPath, outputFilename);
  }
  const filePath = item.filePath || '';
  const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  const parentDir = lastSlash >= 0 ? filePath.substring(0, lastSlash) : '';
  return joinPath(parentDir, outputFilename);
}

export function useUpscaleQueue(options: UseUpscaleQueueOptions) {
  const {
    selectedGpu,
    selectedModel,
    scale,
    tileSize,
    customOutputPath,
    onNotify,
    onItemCompleted,
  } = options;

  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [isBatchRunning, setIsBatchRunning] = useState<boolean>(false);

  const activeJobIdRef = useRef<string | null>(null);
  const batchItemsRef = useRef<BatchItem[]>([]);

  activeJobIdRef.current = activeJobId;

  useEffect(() => {
    batchItemsRef.current = batchItems;
  }, [batchItems]);

  // Once a batch is running, watch for every item reaching a terminal state
  // and flip isBatchRunning back off. This is the sole source of "batch
  // complete" truth -- there is no separate pending-queue driver, since the
  // backend's job queue already serializes execution on its own.
  useEffect(() => {
    if (!isBatchRunning || batchItems.length === 0) return;
    const allTerminal = batchItems.every((item) => TERMINAL_STATUSES.has(item.status));
    if (allTerminal) {
      setIsBatchRunning(false);
      if (onNotify) {
        onNotify('success', 'Batch Complete', 'All items in queue have been processed.');
      }
    }
  }, [batchItems, isBatchRunning, onNotify]);

  const removeItem = useCallback((id: string) => {
    setBatchItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clearQueue = useCallback(() => {
    setBatchItems([]);
    setActiveJobId(null);
    setIsBatchRunning(false);
  }, []);

  const cancelBatch = useCallback(async () => {
    const targets = batchItemsRef.current.filter(
      (item) => item.status === 'processing' || item.status === 'queued'
    );
    await Promise.all(
      targets.map((item) =>
        invoke('cancel_upscale', { jobId: item.id }).catch((err) => {
          console.error('Failed to cancel batch item:', item.id, err);
        })
      )
    );
    setIsBatchRunning(false);
    setActiveJobId(null);
    if (onNotify) {
      onNotify('info', 'Batch Cancelled', 'Remaining queued items were stopped.');
    }
  }, [onNotify]);

  const startBatch = useCallback(async () => {
    const readyItems = batchItems.filter(
      (i) => i.status === 'ready' || i.status === 'error' || (i.status as string) === 'idle'
    );

    if (readyItems.length === 0) {
      if (onNotify) {
        onNotify('warning', 'Queue Complete', 'All items in batch have already completed.');
      }
      return;
    }

    setIsBatchRunning(true);
    if (onNotify) {
      onNotify('info', 'Batch Started', `Processing ${readyItems.length} queued items...`);
    }

    for (const item of readyItems) {
      if (!item.filePath || !item.fileName) continue;
      try {
        setBatchItems((prev) =>
          prev.map((b) => (b.id === item.id ? { ...b, status: 'queued', progress: 0 } : b))
        );

        const outPath = resolveOutputPath(item, scale, customOutputPath);

        const jobId = await invoke<string>('run_upscale', {
          request: {
            job_id: item.id,
            input_path: item.filePath,
            output_path: outPath,
            model_id: selectedModel,
            gpu_id: selectedGpu,
            scale,
            tile_size: tileSize,
            is_video: Boolean(item.isVideo),
          },
        });

        setBatchItems((prev) =>
          prev.map((b) => (b.id === item.id ? { ...b, id: jobId, outputPath: outPath } : b))
        );
      } catch (err) {
        console.error('Failed to start batch item:', err);
        setBatchItems((prev) =>
          prev.map((b) => (b.id === item.id ? { ...b, status: 'error' } : b))
        );
      }
    }
  }, [batchItems, scale, tileSize, selectedGpu, selectedModel, customOutputPath, onNotify]);

  const handleJobProgress = useCallback(
    (progress: JobProgress) => {
      const { job_id, percentage, status, error, output_path } = progress;
      const isDone = status === 'succeeded' || status === 'completed';
      const isErr = status === 'failed';
      const isCanc = status === 'cancelled';
      const isProc = status === 'running' || status === 'processing';

      if (isProc) {
        setActiveJobId(job_id);
      } else if (isDone || isErr || isCanc) {
        setActiveJobId((prev) => (prev === job_id ? null : prev));
      }

      // Side effects (history writes) must not live inside the setState
      // updater below -- React (StrictMode in particular) can invoke that
      // updater more than once per commit, which would double-write history.
      const existing = batchItemsRef.current.find((item) => item.id === job_id);
      if (existing && isDone && onItemCompleted) {
        const finalOut = output_path || existing.outputPath;
        if (finalOut) {
          onItemCompleted(
            { ...existing, progress: percentage, status: 'done', outputPath: finalOut },
            finalOut
          );
        }
      }

      setBatchItems((prev) =>
        prev.map((item) => {
          if (item.id !== job_id) return item;
          const finalOut = output_path || item.outputPath;
          return {
            ...item,
            progress: percentage,
            status: isDone
              ? 'done'
              : isErr
                ? 'error'
                : isCanc
                  ? 'cancelled'
                  : isProc
                    ? 'processing'
                    : 'queued',
            outputPath: finalOut,
            error: isErr ? error : item.error,
          };
        })
      );
    },
    [onItemCompleted]
  );

  return {
    batchItems,
    setBatchItems,
    activeJobId,
    setActiveJobId,
    isBatchRunning,
    startBatch,
    cancelBatch,
    handleJobProgress,
    removeItem,
    clearQueue,
  };
}
