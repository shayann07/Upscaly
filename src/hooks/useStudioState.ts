import { useState, useCallback, useRef } from 'react';
import { getRecentHistory, HistoryItem } from '../lib/history';

// How long a toast stays visible before it's automatically removed. Without
// this, toasts never left the array: only the last 3 ever rendered
// (ToastContainer.slice(-3)), so once 4+ built up, older ones became both
// invisible and undismissable, and the dedupe check below (which reads the
// whole array) would permanently block a future identical notification.
const TOAST_LIFETIME_MS = 5000;

type Toast = { id: string; type: 'success' | 'error' | 'info' | 'warning'; message: string };

export function useStudioState() {
  const [category, setCategory] = useState<'photos' | 'anime' | 'video'>('photos');
  const [activeNavTab, setActiveNavTab] = useState<
    'models' | 'history' | 'settings' | 'about' | null
  >(null);

  const handleToggleNavTab = useCallback((tab: 'models' | 'history' | 'settings' | 'about') => {
    setActiveNavTab((prev) => (prev === tab ? null : tab));
  }, []);

  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  // Owned here (rather than in useStudioActions, where the rest of the
  // cancel-confirmation flow lives) so both useBatchSetup and
  // useStudioActions -- which have their own circular construction-order
  // constraints -- can read its current value directly instead of through
  // a ref-bridge, which only works reliably for callbacks, not values read
  // during the same render they're threaded through.
  const [confirmCancelOpen, setConfirmCancelOpen] = useState<boolean>(false);
  const [jobStatus, setJobStatus] = useState<string>('idle');
  const [progressVal, setProgressVal] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [jobPhase, setJobPhase] = useState<string>('');
  const [etaSeconds, setEtaSeconds] = useState<number | undefined>(undefined);
  const [fps, setFps] = useState<number | undefined>(undefined);
  const [rateStr, setRateStr] = useState<string>('');

  const [comparisonViewMode, setComparisonViewMode] = useState<'split' | 'side-by-side'>('split');
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // React batches multiple setState(updater) calls made in the same
  // synchronous tick and only actually *runs* the queued updater functions
  // later, during the batched re-render -- so reading a variable that an
  // updater assigns (for dedupe, or to decide whether to schedule the
  // auto-dismiss timer) is not reliably up to date right after the
  // setToasts call that queued it. This plain ref is mutated synchronously
  // and is always accurate, independent of React's render/commit timing;
  // `toasts` state is kept as a mirror of it purely to trigger re-renders.
  const toastsStoreRef = useRef<Toast[]>([]);

  const dismissToast = useCallback((id: string) => {
    toastsStoreRef.current = toastsStoreRef.current.filter((t) => t.id !== id);
    setToasts(toastsStoreRef.current);
  }, []);

  const [historyItems, setHistoryItems] = useState<HistoryItem[]>(() => getRecentHistory());

  const handleNotify = useCallback(
    (type: 'success' | 'error' | 'info' | 'warning', title: string, message: string) => {
      const formattedMessage = message ? `${title}: ${message}` : title;
      if (toastsStoreRef.current.some((t) => t.message === formattedMessage)) return;

      const id = `${Date.now()}-${Math.random()}`;
      toastsStoreRef.current = [...toastsStoreRef.current, { id, type, message: formattedMessage }];
      setToasts(toastsStoreRef.current);

      setTimeout(() => dismissToast(id), TOAST_LIFETIME_MS);
    },
    [dismissToast]
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
    confirmCancelOpen,
    setConfirmCancelOpen,
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
    dismissToast,
    historyItems,
    setHistoryItems,
    handleNotify,
    handleGpuReady,
    handleResetJob,
  };
}
