import { useMemo } from 'react';
import { StudioJobState } from '../lib/studioJobHandler';
import { HistoryItem } from '../lib/history';

interface StudioJobStateSetupOptions {
  activeJobId: string | null;
  activeJobIdRef: React.MutableRefObject<string | null>;
  pendingOutputPath: React.MutableRefObject<string>;
  upscaledPath: string | null;
  selectedModel: string;
  fileName: string | null;
  filePath: string | null;
  scale: number;
  isVideo: boolean;
  isMuted: boolean;
  setActiveJobId: (id: string | null) => void;
  setProgressVal: (val: number) => void;
  setJobStatus: (status: string) => void;
  setJobPhase: (phase: string) => void;
  setEtaSeconds: (eta: number) => void;
  setFps: (fps: number) => void;
  setStatusMessage: (msg: string) => void;
  setUpscaledPath: (path: string) => void;
  setHistoryItems: React.Dispatch<React.SetStateAction<HistoryItem[]>>;
  refreshInstalledModels: () => void;
  onNotify: (
    type: 'success' | 'error' | 'info' | 'warning',
    title: string,
    message: string
  ) => void;
}

export function useStudioJobStateSetup({
  activeJobId,
  activeJobIdRef,
  pendingOutputPath,
  upscaledPath,
  selectedModel,
  fileName,
  filePath,
  scale,
  isVideo,
  isMuted,
  setActiveJobId,
  setProgressVal,
  setJobStatus,
  setJobPhase,
  setEtaSeconds,
  setFps,
  setStatusMessage,
  setUpscaledPath,
  setHistoryItems,
  refreshInstalledModels,
  onNotify,
}: StudioJobStateSetupOptions): StudioJobState {
  return useMemo(
    () => ({
      activeJobId,
      activeJobIdRef,
      pendingOutputPath,
      upscaledPath: upscaledPath || '',
      selectedModel,
      fileName: fileName || '',
      filePath: filePath || '',
      scale,
      isVideo,
      isMuted,
      setActiveJobId,
      setProgressVal,
      setJobStatus,
      setJobPhase,
      setEtaSeconds,
      setFps,
      setStatusMessage,
      setUpscaledPath,
      setHistoryItems,
      refreshInstalledModels,
      onNotify,
    }),
    [
      activeJobId,
      activeJobIdRef,
      pendingOutputPath,
      upscaledPath,
      selectedModel,
      fileName,
      filePath,
      scale,
      isVideo,
      isMuted,
      setActiveJobId,
      setProgressVal,
      setJobStatus,
      setJobPhase,
      setEtaSeconds,
      setFps,
      setStatusMessage,
      setUpscaledPath,
      setHistoryItems,
      refreshInstalledModels,
      onNotify,
    ]
  );
}
