import { useState, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { BatchItem, JobProgress } from '../lib/types';
import { joinPath } from '../lib/outputPaths';

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
  const isBatchRunningRef = useRef<boolean>(false);
  const pendingQueueRef = useRef<BatchItem[]>([]);

  activeJobIdRef.current = activeJobId;
  isBatchRunningRef.current = isBatchRunning;

  const removeItem = useCallback((id: string) => {
    setBatchItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clearQueue = useCallback(() => {
    setBatchItems([]);
    setActiveJobId(null);
    setIsBatchRunning(false);
    pendingQueueRef.current = [];
  }, []);

  const runNextInQueue = useCallback(async () => {
    if (!isBatchRunningRef.current) return;
    if (pendingQueueRef.current.length === 0) {
      setIsBatchRunning(false);
      if (onNotify) {
        onNotify('success', 'Batch Complete', 'All items in queue have been processed.');
      }
      return;
    }

    const nextItem = pendingQueueRef.current.shift();
    if (!nextItem || !nextItem.filePath || !nextItem.fileName) {
      runNextInQueue();
      return;
    }

    const outPath = resolveOutputPath(nextItem, scale, customOutputPath);

    try {
      setBatchItems((prev) =>
        prev.map((b) => (b.id === nextItem.id ? { ...b, status: 'queued', progress: 0 } : b))
      );

      const jobId = await invoke<string>('run_upscale', {
        request: {
          job_id: nextItem.id,
          input_path: nextItem.filePath,
          output_path: outPath,
          model_id: selectedModel,
          gpu_id: selectedGpu,
          scale,
          tile_size: tileSize,
          is_video: Boolean(nextItem.isVideo),
        },
      });

      setActiveJobId(jobId);
      setBatchItems((prev) =>
        prev.map((b) => (b.id === nextItem.id ? { ...b, id: jobId, status: 'processing' } : b))
      );
    } catch (err) {
      console.error('Failed to start batch item:', err);
      setBatchItems((prev) =>
        prev.map((b) => (b.id === nextItem.id ? { ...b, status: 'error' } : b))
      );
      runNextInQueue();
    }
  }, [scale, tileSize, selectedGpu, selectedModel, customOutputPath, onNotify]);

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

    pendingQueueRef.current = [...readyItems];
    setIsBatchRunning(true);
    isBatchRunningRef.current = true;
    if (onNotify) {
      onNotify('info', 'Batch Started', `Processing ${readyItems.length} queued items...`);
    }
    await runNextInQueue();
  }, [batchItems, onNotify, runNextInQueue]);

  const handleJobProgress = useCallback(
    (progress: JobProgress) => {
      const { job_id, percentage, status, error, output_path } = progress;
      const isDone = status === 'succeeded' || status === 'completed';
      const isErr = status === 'failed';
      const isCanc = status === 'cancelled';

      setBatchItems((prev) =>
        prev.map((item) => {
          if (item.id === job_id) {
            const finalOut = output_path || item.outputPath;
            const updated: BatchItem = {
              ...item,
              progress: percentage,
              status: isDone
                ? 'done'
                : isErr
                  ? 'error'
                  : isCanc
                    ? 'cancelled'
                    : status === 'running' || status === 'processing'
                      ? 'processing'
                      : 'queued',
              outputPath: finalOut,
              error: isErr ? error : item.error,
            };
            if (isDone && onItemCompleted && finalOut) {
              onItemCompleted(updated, finalOut);
            }
            return updated;
          }
          return item;
        })
      );

      if ((isDone || isErr || isCanc) && job_id === activeJobIdRef.current) {
        setActiveJobId(null);
        if (isBatchRunningRef.current) {
          runNextInQueue();
        }
      }
    },
    [onItemCompleted, runNextInQueue]
  );

  return {
    batchItems,
    setBatchItems,
    activeJobId,
    setActiveJobId,
    isBatchRunning,
    startBatch,
    handleJobProgress,
    removeItem,
    clearQueue,
  };
}
