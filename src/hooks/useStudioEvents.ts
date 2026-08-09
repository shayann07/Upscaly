import { useCallback } from 'react';
import { useJobEvents } from './useJobEvents';
import { JobProgress } from '../lib/types';
import { handleStudioJobStatus, StudioJobState } from '../lib/studioJobHandler';

interface StudioEventsOptions {
  handleQueueJobProgress: (progress: JobProgress) => void;
  studioJobState: StudioJobState;
  refreshInstalledModels: () => void;
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
  onNotify,
}: StudioEventsOptions) {
  const handleJobStatusChanged = useCallback(
    (progress: JobProgress) => {
      handleQueueJobProgress(progress);
      handleStudioJobStatus(progress, studioJobState);
    },
    [handleQueueJobProgress, studioJobState]
  );

  const handleDownloadProgress = useCallback(
    (payload: { model_id: string; percentage: number }) => {
      if (payload.percentage >= 100) {
        refreshInstalledModels();
        onNotify(
          'success',
          'Model Downloaded',
          `Model ${payload.model_id} installed successfully.`
        );
      }
    },
    [refreshInstalledModels, onNotify]
  );

  useJobEvents(handleJobStatusChanged, handleDownloadProgress);
}
