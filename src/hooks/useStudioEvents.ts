import { useCallback, useRef, useEffect } from 'react';
import { useJobEvents } from './useJobEvents';
import { JobSnapshot } from '../lib/types';
import { handleStudioJobStatus, StudioJobState } from '../lib/studioJobHandler';

interface StudioEventsOptions {
  handleQueueJobProgress: (progress: JobSnapshot) => void;
  studioJobState: StudioJobState;
  setDownloadingModelId?: (id: string | null) => void;
  setDownloadProgress?: (progress: number) => void;
  refreshInstalledModels?: () => void;
}

export function useStudioEvents({
  handleQueueJobProgress,
  studioJobState,
  setDownloadingModelId,
  setDownloadProgress,
  refreshInstalledModels,
}: StudioEventsOptions) {
  const studioJobStateRef = useRef(studioJobState);
  useEffect(() => {
    studioJobStateRef.current = studioJobState;
  }, [studioJobState]);

  const handleJobsChanged = useCallback(
    (jobs: JobSnapshot[]) => {
      for (const job of jobs) {
        handleQueueJobProgress(job);
        handleStudioJobStatus(job, studioJobStateRef.current);
      }
    },
    [handleQueueJobProgress]
  );

  // Each model download streams progress for two files (.param then .bin),
  // so percentage resets partway through and hits 100 twice -- it is not a
  // reliable "the whole model finished" signal. That completion event
  // (success toast, catalog refresh, clearing downloadingModelId) is owned
  // solely by useModelCatalog.handleDownloadModel's invoke().then(), which
  // only resolves once both files are downloaded and verified. This
  // handler exists purely to drive the live progress bar.
  const handleDownloadProgress = useCallback(
    (payload: { model_id: string; percentage: number }) => {
      if (setDownloadingModelId) setDownloadingModelId(payload.model_id);
      if (setDownloadProgress) setDownloadProgress(payload.percentage);
    },
    [setDownloadingModelId, setDownloadProgress]
  );

  // Backend-driven catalog invalidation. Keeps the model list correct for
  // any on-disk change the backend reports, including ones this frontend
  // did not initiate and therefore would never have refreshed itself.
  const handleModelCatalogUpdated = useCallback(() => {
    refreshInstalledModels?.();
  }, [refreshInstalledModels]);

  useJobEvents(handleJobsChanged, handleDownloadProgress, handleModelCatalogUpdated);
}
