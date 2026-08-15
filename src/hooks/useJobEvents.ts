import { useEffect, useRef } from 'react';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { JobSnapshot, JobsDelta } from '../lib/types';

export interface DownloadProgressPayload {
  model_id: string;
  percentage: number;
}

export function useJobEvents(
  onJobsChanged?: (jobs: JobSnapshot[]) => void,
  onDownloadProgress?: (payload: DownloadProgressPayload) => void,
  onModelCatalogUpdated?: () => void
) {
  const onJobsChangedRef = useRef(onJobsChanged);
  const onDownloadProgressRef = useRef(onDownloadProgress);
  const onModelCatalogUpdatedRef = useRef(onModelCatalogUpdated);

  useEffect(() => {
    onJobsChangedRef.current = onJobsChanged;
  }, [onJobsChanged]);

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

    // One event per flush window carrying every job that changed in it,
    // rather than one event per job per progress tick. The backend decides
    // what a "change" is and coalesces the stream; this side just applies
    // whatever arrived.
    register<JobsDelta>('jobs-delta', (payload) => {
      if (payload?.jobs?.length) onJobsChangedRef.current?.(payload.jobs);
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
