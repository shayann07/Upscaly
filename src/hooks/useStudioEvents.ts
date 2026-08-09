import { useCallback, useRef, useEffect } from 'react';
import { useJobEvents } from './useJobEvents';
import { JobProgress } from '../lib/types';
import { handleStudioJobStatus, StudioJobState } from '../lib/studioJobHandler';

interface StudioEventsOptions {
  handleQueueJobProgress: (progress: JobProgress) => void;
  studioJobState: StudioJobState;
  refreshInstalledModels: () => void;
  setDownloadingModelId?: (id: string | null) => void;
  setDownloadProgress?: (progress: number) => void;
  onNotify: (
    type: 'success' | 'error' | 'info' | 'warning',
    title: string,
    message: string
  ) => void;
}

export function useStudioEvents({
  handleQueueJobProgress,
  studioJobState,
  refreshInstalledModels,
  setDownloadingModelId,
  setDownloadProgress,
  onNotify,
}: StudioEventsOptions) {
  const studioJobStateRef = useRef(studioJobState);
  useEffect(() => {
    studioJobStateRef.current = studioJobState;
  }, [studioJobState]);

  const handleJobStatusChanged = useCallback(
    (progress: JobProgress) => {
      handleQueueJobProgress(progress);
      handleStudioJobStatus(progress, studioJobStateRef.current);
    },
    [handleQueueJobProgress]
  );

  const handleDownloadProgress = useCallback(
    (payload: { model_id: string; percentage: number }) => {
      if (setDownloadingModelId) setDownloadingModelId(payload.model_id);
      if (setDownloadProgress) setDownloadProgress(payload.percentage);
      if (payload.percentage >= 100) {
        if (setDownloadingModelId) setDownloadingModelId(null);
        if (setDownloadProgress) setDownloadProgress(0);
        refreshInstalledModels();
        onNotify(
          'success',
          'Model Downloaded',
          `Model ${payload.model_id} installed successfully.`
        );
      }
    },
    [refreshInstalledModels, onNotify, setDownloadingModelId, setDownloadProgress]
  );

  useJobEvents(handleJobStatusChanged, handleDownloadProgress);
}
