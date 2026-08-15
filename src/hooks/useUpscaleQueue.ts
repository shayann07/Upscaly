import { useState, useCallback, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { BatchItem, JobProgress, UpscaleJobHandle } from '../lib/types';
import { normalizeJobStatus, isValidStateTransition, isTerminalState } from '../lib/jobState';


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
    const allTerminal = batchItems.every((item) => isTerminalState(item.status));
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
      (item) => item.status === 'running' || item.status === 'queued'
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
    // A previously failed item is retryable, so it counts as ready to run.
    const readyItems = batchItems.filter((i) => i.status === 'ready' || i.status === 'failed');

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

        // Backend names and reserves the output, then reports it back. This
        // matters more for a batch than for a single job: several queued
        // items can resolve to the same name, and only the backend's
        // reservation can hand each a distinct one.
        const { job_id: jobId, output_path: outPath } = await invoke<UpscaleJobHandle>(
          'run_upscale',
          {
            request: {
              job_id: item.id,
              input_path: item.filePath,
              output_dir: customOutputPath || null,
              model_id: selectedModel,
              gpu_id: selectedGpu,
              scale,
              tile_size: tileSize,
              is_video: Boolean(item.isVideo),
            },
          }
        );

        setBatchItems((prev) =>
          prev.map((b) => (b.id === item.id ? { ...b, id: jobId, outputPath: outPath } : b))
        );
      } catch (err) {
        console.error('Failed to start batch item:', err);
        setBatchItems((prev) =>
          prev.map((b) => (b.id === item.id ? { ...b, status: 'failed' } : b))
        );
      }
    }
  }, [batchItems, scale, tileSize, selectedGpu, selectedModel, customOutputPath, onNotify]);

  const handleJobProgress = useCallback(
    (progress: JobProgress) => {
      const { job_id, percentage, status, error, output_path } = progress;

      // A job that already reached a terminal state can still have an
      // event arrive after it -- out-of-order delivery, or a duplicate
      // late tick. Applying it would resurrect a finished/cancelled row
      // back to "processing" with no live job behind it. This table
      // already existed (jobState.ts) but was previously exercised only
      // by its own tests, never by the real event handler.
      const existing = batchItemsRef.current.find((item) => item.id === job_id);
      // Normalize once here, at the event boundary. Everything below -- and
      // everything reading item.status afterwards -- deals only in canonical
      // JobState values.
      const nextState = normalizeJobStatus(status);
      if (existing && !isValidStateTransition(existing.status, nextState)) {
        return;
      }

      const isDone = nextState === 'succeeded';
      const isErr = nextState === 'failed';
      const isCanc = nextState === 'cancelled';
      const isProc = nextState === 'running';

      if (isProc) {
        setActiveJobId(job_id);
      } else if (isDone || isErr || isCanc) {
        setActiveJobId((prev) => (prev === job_id ? null : prev));
      }

      // Side effects (history writes) must not live inside the setState
      // updater below -- React (StrictMode in particular) can invoke that
      // updater more than once per commit, which would double-write history.
      if (existing && isDone && onItemCompleted) {
        const finalOut = output_path || existing.outputPath;
        if (finalOut) {
          onItemCompleted(
            { ...existing, progress: percentage, status: 'succeeded', outputPath: finalOut },
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
            status: nextState,
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
