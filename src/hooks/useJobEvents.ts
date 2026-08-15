import { useEffect, useRef } from 'react';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { JobProgress } from '../lib/types';

export interface DownloadProgressPayload {
  model_id: string;
  percentage: number;
}

export function useJobEvents(
  onJobStatusChanged?: (progress: JobProgress) => void,
  onDownloadProgress?: (payload: DownloadProgressPayload) => void,
  onModelCatalogUpdated?: () => void
) {
  const onJobStatusChangedRef = useRef(onJobStatusChanged);
  const onDownloadProgressRef = useRef(onDownloadProgress);
  const onModelCatalogUpdatedRef = useRef(onModelCatalogUpdated);

  useEffect(() => {
    onJobStatusChangedRef.current = onJobStatusChanged;
  }, [onJobStatusChanged]);

  useEffect(() => {
    onDownloadProgressRef.current = onDownloadProgress;
  }, [onDownloadProgress]);

  useEffect(() => {
    onModelCatalogUpdatedRef.current = onModelCatalogUpdated;
  }, [onModelCatalogUpdated]);

  useEffect(() => {
    let isCancelled = false;
    const unlisteners: UnlistenFn[] = [];

    // Registration resolves asynchronously, so an unmount can land before
    // the promise settles -- in that case unlisten immediately rather than
    // storing a subscription nothing will ever tear down.
    const register = <T>(eventName: string, handle: (payload: T) => void) => {
      listen<T>(eventName, (event) => {
        if (!isCancelled) handle(event.payload);
      })
        .then((unlisten) => {
          if (isCancelled) {
            unlisten();
          } else {
            unlisteners.push(unlisten);
          }
        })
        .catch(() => {});
    };

    register<JobProgress>('job-status-changed', (payload) => {
      onJobStatusChangedRef.current?.(payload);
    });

    register<DownloadProgressPayload>('download-progress', (payload) => {
      onDownloadProgressRef.current?.(payload);
    });

    // The backend emits this whenever the on-disk model set changes. The
    // download flow already refreshes on its own invoke().then(), but that
    // only covers catalog mutations this frontend initiated -- honouring
    // the event keeps the displayed catalog correct no matter which path
    // changed it, and makes the backend the source of truth rather than
    // relying on every caller remembering to refresh.
    register<void>('model-catalog-updated', () => {
      onModelCatalogUpdatedRef.current?.();
    });

    return () => {
      isCancelled = true;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, []);
}
