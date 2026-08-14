import { useState, useCallback } from 'react';
import { getRecentHistory, HistoryItem } from '../lib/history';

export function useStudioState() {
  const [category, setCategory] = useState<'photos' | 'anime' | 'video'>('photos');
  const [activeNavTab, setActiveNavTab] = useState<
    'models' | 'history' | 'settings' | 'about' | null
  >(null);

  const handleToggleNavTab = useCallback((tab: 'models' | 'history' | 'settings' | 'about') => {
    setActiveNavTab((prev) => (prev === tab ? null : tab));
  }, []);

  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string>('idle');
  const [progressVal, setProgressVal] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [jobPhase, setJobPhase] = useState<string>('');
  const [etaSeconds, setEtaSeconds] = useState<number | undefined>(undefined);
  const [fps, setFps] = useState<number | undefined>(undefined);
  const [rateStr, setRateStr] = useState<string>('');

  const [comparisonViewMode, setComparisonViewMode] = useState<'split' | 'side-by-side'>('split');
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [toasts, setToasts] = useState<
    Array<{ id: string; type: 'success' | 'error' | 'info' | 'warning'; message: string }>
  >([]);

  const [historyItems, setHistoryItems] = useState<HistoryItem[]>(() => getRecentHistory());

  const handleNotify = useCallback(
    (type: 'success' | 'error' | 'info' | 'warning', title: string, message: string) => {
      const formattedMessage = message ? `${title}: ${message}` : title;
      setToasts((prev) => {
        if (prev.some((t) => t.message === formattedMessage)) return prev;
        return [
          ...prev,
          {
            id: `${Date.now()}-${Math.random()}`,
            type,
            message: formattedMessage,
          },
        ];
      });
    },
    []
  );

  const handleGpuReady = useCallback(
    (gpuName: string) => {
      handleNotify('info', `GPU Acceleration Ready`, `${gpuName}`);
    },
    [handleNotify]
  );

  const handleResetJob = useCallback(() => {
    setJobStatus('idle');
    setProgressVal(0);
    setStatusMessage('');
    setJobPhase('');
    setEtaSeconds(undefined);
    setFps(undefined);
    setRateStr('');
  }, []);

  return {
    category,
    setCategory,
    activeNavTab,
    setActiveNavTab,
    handleToggleNavTab,
    activeJobId,
    setActiveJobId,
    jobStatus,
    setJobStatus,
    progressVal,
    setProgressVal,
    statusMessage,
    setStatusMessage,
    jobPhase,
    setJobPhase,
    etaSeconds,
    setEtaSeconds,
    fps,
    setFps,
    rateStr,
    setRateStr,
    comparisonViewMode,
    setComparisonViewMode,
    zoomLevel,
    setZoomLevel,
    toasts,
    setToasts,
    historyItems,
    setHistoryItems,
    handleNotify,
    handleGpuReady,
    handleResetJob,
  };
}
