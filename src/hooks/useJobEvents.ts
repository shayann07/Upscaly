import { useEffect, useRef } from 'react';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { JobProgress } from '../lib/types';

export interface DownloadProgressPayload {
  model_id: string;
  percentage: number;
}

export function useJobEvents(
  onJobStatusChanged?: (progress: JobProgress) => void,
  onDownloadProgress?: (payload: DownloadProgressPayload) => void
) {
  const onJobStatusChangedRef = useRef(onJobStatusChanged);
  const onDownloadProgressRef = useRef(onDownloadProgress);

  useEffect(() => {
    onJobStatusChangedRef.current = onJobStatusChanged;
  }, [onJobStatusChanged]);

  useEffect(() => {
    onDownloadProgressRef.current = onDownloadProgress;
  }, [onDownloadProgress]);

  useEffect(() => {
    let unlistenJob: UnlistenFn | null = null;
    let unlistenDownload: UnlistenFn | null = null;
    let isCancelled = false;

    listen<JobProgress>('job-status-changed', (event) => {
      if (!isCancelled && onJobStatusChangedRef.current) {
        onJobStatusChangedRef.current(event.payload);
      }
    }).then((unlisten) => {
      if (isCancelled) {
        unlisten();
      } else {
        unlistenJob = unlisten;
      }
    });

    listen<DownloadProgressPayload>('download-progress', (event) => {
      if (!isCancelled && onDownloadProgressRef.current) {
        onDownloadProgressRef.current(event.payload);
      }
    }).then((unlisten) => {
      if (isCancelled) {
        unlisten();
      } else {
        unlistenDownload = unlisten;
      }
    });

    return () => {
      isCancelled = true;
      if (unlistenJob) unlistenJob();
      if (unlistenDownload) unlistenDownload();
    };
  }, []);
}
