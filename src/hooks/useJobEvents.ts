import { useEffect } from 'react';
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
  useEffect(() => {
    let unlistenJob: UnlistenFn | null = null;
    let unlistenDownload: UnlistenFn | null = null;
    let isCancelled = false;

    if (onJobStatusChanged) {
      listen<JobProgress>('job-status-changed', (event) => {
        if (!isCancelled && onJobStatusChanged) {
          onJobStatusChanged(event.payload);
        }
      }).then((unlisten) => {
        if (isCancelled) {
          unlisten();
        } else {
          unlistenJob = unlisten;
        }
      });
    }

    if (onDownloadProgress) {
      listen<DownloadProgressPayload>('download-progress', (event) => {
        if (!isCancelled && onDownloadProgress) {
          onDownloadProgress(event.payload);
        }
      }).then((unlisten) => {
        if (isCancelled) {
          unlisten();
        } else {
          unlistenDownload = unlisten;
        }
      });
    }

    return () => {
      isCancelled = true;
      if (unlistenJob) unlistenJob();
      if (unlistenDownload) unlistenDownload();
    };
  }, [onJobStatusChanged, onDownloadProgress]);
}
