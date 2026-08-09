import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { motion, AnimatePresence } from 'framer-motion';

// Custom Components & Libs
import { Titlebar } from './components/Titlebar';
import { DropZone } from './components/DropZone';
import { ProgressOverlay } from './components/ProgressOverlay';
import { CompletionCard } from './components/CompletionCard';
import { SettingsPanel } from './components/SettingsPanel';
import { AdvancedSettings } from './components/AdvancedSettings';
import { ComparisonSlider } from './components/ComparisonSlider';
import { ModelCatalogModal } from './components/ModelCatalogModal';
import { ToastContainer, ToastItem } from './components/ToastContainer';
import { RecentHistoryDrawer } from './components/RecentHistoryDrawer';
import { AboutModal } from './components/AboutModal';
import { BatchQueueView } from './components/BatchQueueView';

import { useSettings } from './hooks/useSettings';
import { useModelCatalog } from './hooks/useModelCatalog';
import { useMediaSelection } from './hooks/useMediaSelection';
import { useJobEvents } from './hooks/useJobEvents';
import { useUpscaleQueue } from './hooks/useUpscaleQueue';

import { playCompleteSound, playErrorSound } from './lib/sound';
import { getMediaSrc } from './lib/media';
import { getModelMetadata } from './lib/models';
import { SUPPORTED_MODELS, JobProgress, BatchItem, HistoryEntry } from './lib/types';
import { addHistoryItem, getRecentHistory, HistoryItem } from './lib/history';

export default function App() {
  const [category, setCategory] = useState<'photos' | 'anime' | 'video'>('photos');
  const [activeNavTab, setActiveNavTab] = useState<
    'models' | 'history' | 'settings' | 'about' | null
  >(null);

  const handleToggleNavTab = (tab: 'models' | 'history' | 'settings' | 'about') => {
    setActiveNavTab((prev) => (prev === tab ? null : tab));
  };

  // Processing state
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string>('idle');
  const [progressVal, setProgressVal] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [jobPhase, setJobPhase] = useState<string>('');
  const [etaSeconds, setEtaSeconds] = useState<number | undefined>(undefined);
  const [fps, setFps] = useState<number | undefined>(undefined);
  const [rateStr, setRateStr] = useState<string>('14.2 MP/s');
  const jobStartTimeRef = useRef<number | null>(null);

  // Studio Interactive Modes & Zoom
  const [comparisonViewMode, setComparisonViewMode] = useState<'split' | 'side-by-side'>('split');
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // History state
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>(() => getRecentHistory());

  const pendingOutputPath = useRef<string>('');
  const activeJobIdRef = useRef<string | null>(null);

  const handleNotify = useCallback(
    (type: 'success' | 'error' | 'info' | 'warning', title: string, message: string) => {
      const formattedMessage = message ? `${title}: ${message}` : title;
      setToasts((prev) => {
        if (prev.some((t) => t.message === formattedMessage)) {
          return prev;
        }
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

  // Extracted Hooks
  const {
    gpus,
    selectedGpu,
    setSelectedGpu,
    scale,
    setScale,
    tileSize,
    setTileSize,
    customOutputPath,
    setCustomOutputPath,
    isMuted,
    handleToggleMute,
  } = useSettings(handleGpuReady);

  const {
    supportedModels,
    installedModels,
    selectedModel,
    setSelectedModel,
    downloadingModelId,
    downloadProgress,
    refreshInstalledModels,
    handleDownloadModel,
  } = useModelCatalog(handleNotify);

  const handleSelectCategory = useCallback(
    (cat: 'photos' | 'anime' | 'video') => {
      setCategory(cat);
      const filtered = supportedModels.filter((m) => m.cat === cat);
      if (filtered.length > 0) {
        const installedFiltered = filtered.filter((m) => installedModels.includes(m.id));
        if (installedFiltered.length > 0) {
          setSelectedModel(installedFiltered[0].id);
        } else {
          setSelectedModel(filtered[0].id);
        }
      }
    },
    [supportedModels, installedModels, setSelectedModel]
  );

  const handleResetJob = useCallback(() => {
    setJobStatus('idle');
    setProgressVal(0);
    setStatusMessage('');
    setJobPhase('');
  }, []);

  const {
    filePath,
    setFilePath,
    fileName,
    setFileName,
    isVideo,
    setIsVideo,
    currentFileDims,
    setCurrentFileDims,
    upscaledPath,
    setUpscaledPath,
    handleClearFile,
    handleOpenFile,
    handleOpenFolder,
  } = useMediaSelection(isMuted, selectedModel, handleSelectCategory, handleNotify, handleResetJob);
  const isDragOver = false;

  const onItemCompleted = useCallback(
    (item: BatchItem, outputPath: string) => {
      const meta = getModelMetadata(selectedModel);
      const newHist = addHistoryItem({
        fileName: item.fileName || fileName,
        originalPath: item.filePath || filePath,
        upscaledPath: outputPath,
        modelName: meta.name,
        scale,
        isVideo: item.isVideo ?? isVideo,
      });
      setHistoryItems(newHist);
      playCompleteSound(isMuted);
    },
    [selectedModel, fileName, filePath, scale, isVideo, isMuted]
  );

  const {
    batchItems,
    setBatchItems,
    startBatch: handleStartBatchUpscale,
    handleJobProgress: handleQueueJobProgress,
    removeItem: handleRemoveBatchItem,
  } = useUpscaleQueue({
    selectedGpu,
    selectedModel,
    scale,
    tileSize,
    customOutputPath,
    onNotify: handleNotify,
    onItemCompleted,
  });

  // Dynamic GPU VRAM calculation
  const currentGpuInfo = gpus.find((g) => g.id === selectedGpu) || gpus[0];
  const totalGpuVramGb = (() => {
    if (!currentGpuInfo) return 8;
    const match =
      currentGpuInfo.name.match(/(\d+)\s*GB/i) ||
      (currentGpuInfo.detail && currentGpuInfo.detail.match(/(\d+)\s*GB/i));
    if (match && match[1]) return parseInt(match[1], 10);
    if (
      currentGpuInfo.name.toLowerCase().includes('intel') ||
      currentGpuInfo.name.toLowerCase().includes('uhd')
    )
      return 2;
    return 8;
  })();

  const activeVramGb = (() => {
    if (selectedGpu === -1) return 'SYSTEM RAM';
    const isProc = jobStatus === 'processing' || jobStatus === 'queued';
    if (isProc) {
      const tileMult =
        tileSize === 512 ? 0.75 : tileSize === 256 ? 0.45 : tileSize === 128 ? 0.25 : 0.55;
      const used = Math.min(totalGpuVramGb, Math.round(totalGpuVramGb * tileMult * 10) / 10);
      return `${used.toFixed(1)} GB`;
    }
    const idle = Math.round(totalGpuVramGb * 0.22 * 10) / 10;
    return `${idle.toFixed(1)} GB`;
  })();

  const handleCycleZoom = () => {
    setZoomLevel((prev) => (prev === 1 ? 2 : prev === 2 ? 4 : prev === 4 ? 8 : 1));
  };

  // Toast Helpers
  const addToast = (
    type: 'success' | 'error' | 'info' | 'warning',
    title: string,
    message: string
  ) => {
    const formattedMessage = message ? `${title}: ${message}` : title;
    setToasts((prev) => {
      if (prev.some((t) => t.message === formattedMessage)) {
        return prev;
      }
      return [
        ...prev,
        {
          id: `${Date.now()}-${Math.random()}`,
          type,
          message: formattedMessage,
        },
      ];
    });
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Global Keyboard Shortcuts (⌘O, ⌘↩, ESC, ⌘S, ⌘H)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput =
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          (activeEl as HTMLElement).isContentEditable);

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'o') {
        if (isInput) return;
        e.preventDefault();
        handleOpenFile();
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        if (isInput) return;
        e.preventDefault();
        handleStartUpscale();
      } else if (e.key === 'Escape') {
        if (activeJobId) {
          handleCancelUpscale();
        } else {
          setActiveNavTab(null);
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        if (isInput) return;
        e.preventDefault();
        handleToggleNavTab('settings');
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'h') {
        if (isInput) return;
        e.preventDefault();
        handleToggleNavTab('history');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeJobId, filePath, batchItems]);

  // Job and download event listeners
  const handleJobStatusChanged = useCallback(
    (progress: JobProgress) => {
      handleQueueJobProgress(progress);

      const {
        job_id,
        percentage,
        status,
        error,
        phase,
        eta_seconds,
        fps: jobFps,
        output_path: eventOutPath,
      } = progress;

      const isCurrentStudioJob =
        (activeJobId && job_id === activeJobId) ||
        (activeJobIdRef.current && job_id === activeJobIdRef.current);
      if (isCurrentStudioJob) {
        if (activeJobIdRef.current !== job_id) {
          activeJobIdRef.current = job_id;
          setActiveJobId(job_id);
        }
        const effectiveStatus =
          status === 'succeeded' || status === 'completed'
            ? 'completed'
            : status === 'running' || status === 'processing'
              ? 'processing'
              : status;
        setProgressVal(percentage);
        setJobStatus(effectiveStatus);
        if (phase) setJobPhase(phase);

        if (eta_seconds !== undefined && eta_seconds > 0) {
          setEtaSeconds(eta_seconds);
        }

        if (jobFps !== undefined && jobFps > 0) {
          setFps(jobFps);
        }

        if (status === 'running' || status === 'processing') {
          setStatusMessage(`Upscaling in progress... ${percentage.toFixed(1)}%`);
        } else if (status === 'queued') {
          setStatusMessage('Queued in GPU worker thread...');
        } else if (status === 'succeeded' || status === 'completed') {
          setStatusMessage('Upscaling Completed Successfully!');
          const finalPath = eventOutPath || pendingOutputPath.current || upscaledPath;
          if (finalPath) {
            setUpscaledPath(finalPath);
            const meta = getModelMetadata(selectedModel);
            const newHist = addHistoryItem({
              fileName,
              originalPath: filePath,
              upscaledPath: finalPath,
              modelName: meta.name,
              scale,
              isVideo,
            });
            setHistoryItems(newHist);
          }
          activeJobIdRef.current = null;
          setActiveJobId(null);
          refreshInstalledModels();
          playCompleteSound(isMuted);
          handleNotify('success', 'Upscaling Complete', 'Enhanced output saved.');
        } else if (status === 'failed') {
          activeJobIdRef.current = null;
          setActiveJobId(null);
          setJobStatus('idle');
          playErrorSound(isMuted);
          const errStr = error || 'Processing failed during sidecar execution.';
          handleNotify('error', 'Upscaling Failed', errStr);
        } else if (status === 'cancelled') {
          activeJobIdRef.current = null;
          setActiveJobId(null);
          setJobStatus('idle');
          handleNotify('info', 'Cancelled', 'Upscaling task was cancelled.');
        }
      }
    },
    [
      activeJobId,
      upscaledPath,
      selectedModel,
      fileName,
      filePath,
      scale,
      isVideo,
      isMuted,
      handleQueueJobProgress,
      refreshInstalledModels,
      handleNotify,
    ]
  );

  const handleDownloadProgress = useCallback(
    (payload: { model_id: string; percentage: number }) => {
      if (payload.percentage >= 100) {
        refreshInstalledModels();
        handleNotify(
          'success',
          'Model Downloaded',
          `Model ${payload.model_id} installed successfully.`
        );
      }
    },
    [refreshInstalledModels, handleNotify]
  );

  useJobEvents(handleJobStatusChanged, handleDownloadProgress);

  // Synchronized Model Selection
  const handleSelectModel = (modelId: string) => {
    setSelectedModel(modelId);
    const modelInfo = SUPPORTED_MODELS.find((m) => m.id === modelId);
    if (modelInfo) {
      if (modelInfo.scale) setScale(modelInfo.scale);
      const modelCat = modelInfo.cat === 'photo' ? 'photos' : (modelInfo.cat as 'anime' | 'video');
      if (category !== modelCat) {
        setCategory(modelCat);
      }
    }
  };

  const joinPath = (dir: string, filename: string): string => {
    const cleanDir = dir.replace(/[/\\]+$/, '');
    return `${cleanDir}\\${filename}`;
  };

  const handleSelectDestinationFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
      });
      if (selected && typeof selected === 'string') {
        const normalized = selected.replace(/\//g, '\\');
        setCustomOutputPath(normalized);
        addToast('info', 'Output Folder Set', normalized);
      }
    } catch (err) {
      console.error('Failed to pick folder:', err);
    }
  };

  // Start Upscale Logic
  const handleStartUpscale = async () => {
    if (batchItems.length > 1) {
      handleStartBatchUpscale();
      return;
    }

    if (gpus.length === 0) {
      addToast(
        'error',
        'No Vulkan GPU Found',
        'No Vulkan-compatible GPU detected. Please install updated graphics display drivers.'
      );
      return;
    }

    if (!filePath) {
      addToast('warning', 'No File Selected', 'Please drag and drop or open an image/video first.');
      return;
    }

    try {
      const clientJobId = crypto.randomUUID();
      activeJobIdRef.current = clientJobId;
      setActiveJobId(clientJobId);

      jobStartTimeRef.current = Date.now();
      setEtaSeconds(8);
      setRateStr('14.2 MP/s');

      setJobStatus('queued');
      setProgressVal(0);
      setStatusMessage('Queued in GPU worker thread...');
      setJobPhase('PREPARING');

      const ext = isVideo ? '.mp4' : '.png';
      const baseName = fileName.replace(/\.[^/.]+$/, '');
      const outputFilename = `${baseName}_upscaled_${scale}x${ext}`;

      let outPath = '';
      if (customOutputPath) {
        outPath = joinPath(customOutputPath, outputFilename);
      } else {
        const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
        const parentDir = filePath.substring(0, lastSlash);
        outPath = joinPath(parentDir, outputFilename);
      }

      pendingOutputPath.current = outPath;

      const jobId = await invoke<string>('run_upscale', {
        request: {
          job_id: clientJobId,
          input_path: filePath,
          output_path: outPath,
          model_id: selectedModel,
          gpu_id: selectedGpu,
          scale,
          tile_size: tileSize,
          is_video: isVideo,
        },
      });

      setJobStatus('processing');
      addToast('info', 'Upscaling Started', `Job ID: ${jobId.slice(0, 8)}...`);
    } catch (err) {
      console.error('Upscale failed to start:', err);
      setActiveJobId(null);
      setJobStatus('idle');
      playErrorSound(isMuted);
      addToast('error', 'Error Starting Upscale', String(err));
    }
  };

  const handleCancelUpscale = async (idToCancel?: string) => {
    const targetId = idToCancel || activeJobId;
    if (!targetId) return;

    try {
      await invoke('cancel_upscale', { jobId: targetId });
      setActiveJobId(null);
      setJobStatus('idle');
      addToast('info', 'Cancelled', 'Upscaling process was cancelled.');
    } catch (err) {
      console.error('Failed to cancel job:', err);
    }
  };

  const handleShowInExplorerNative = (path: string) => {
    revealItemInDir(path).catch((err: unknown) => {
      console.error('Failed to reveal item:', err);
      addToast('error', 'Explorer Error', String(err));
    });
  };

  const handleLoadHistoryItem = async (item: HistoryEntry) => {
    const originalPath = item.inputPath || '';
    const upscaledPath = item.outputPath || '';
    const origExists = await invoke<boolean>('check_file_exists', { path: originalPath }).catch(
      () => false
    );
    const upscaledExists = upscaledPath
      ? await invoke<boolean>('check_file_exists', { path: upscaledPath }).catch(() => false)
      : false;

    if (!origExists || !upscaledExists) {
      const missingLabel = !origExists ? 'Original source file' : 'Upscaled output file';
      addToast('error', 'File Missing from Disk', `${missingLabel} no longer exists on disk.`);
      setActiveNavTab(null);
      return;
    }

    setFilePath(originalPath);
    setFileName(item.name || '');
    setUpscaledPath(upscaledPath);
    setIsVideo(item.isVideo || false);
    setScale(item.scale || 4);
    setJobStatus('completed');
    setActiveNavTab(null);
    setBatchItems([]);
    setZoomLevel(1);
    addToast('info', 'Loaded from History', item.name || 'File');
  };

  const isVramOverflowing = useMemo(() => {
    const currentGpu = gpus.find((g) => g.id === selectedGpu);
    let totalVram = 8;
    if (currentGpu) {
      const match =
        currentGpu.name.match(/(\d+)\s*GB/i) ||
        (currentGpu.detail && currentGpu.detail.match(/(\d+)\s*GB/i));
      if (match && match[1]) totalVram = parseInt(match[1], 10);
      else if (
        currentGpu.name.toLowerCase().includes('intel') ||
        currentGpu.name.toLowerCase().includes('uhd')
      )
        totalVram = 2;
    }
    const baseIdle = Math.round(totalVram * 0.12 * 10) / 10;
    const tileFootprint =
      tileSize === 512 ? 3.0 : tileSize === 256 ? 1.5 : tileSize === 128 ? 0.7 : 1.2;
    const used = Math.round((baseIdle + tileFootprint * 0.85) * 10) / 10;
    return used > totalVram;
  }, [gpus, selectedGpu, tileSize]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--bg-stripe)',
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-ui)',
        fontSize: '13px',
        overflow: 'hidden',
        userSelect: 'none',
        WebkitFontSmoothing: 'antialiased',
      }}
    >
      {/* Center Workspace Canvas Stage - Full Bleed Window */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        <AnimatePresence mode="wait">
          {!filePath && batchItems.length === 0 ? (
            /* EMPTY DROPZONE STAGE WITH ULTRA-SMOOTH SPRING REVEAL */
            <motion.div
              key="empty-stage"
              initial={{ opacity: 0, scale: 0.96, filter: 'blur(8px)' }}
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, scale: 0.96, filter: 'blur(8px)' }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              style={{
                position: 'relative',
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background:
                    'radial-gradient(105% 75% at 50% 45%, rgba(11,10,9,.55), rgba(11,10,9,.88) 78%)',
                }}
              />
              <DropZone
                isDragOver={isDragOver}
                onAddFiles={handleOpenFile}
                onAddBatch={handleOpenFolder}
              />
            </motion.div>
          ) : (
            /* ACTIVE MEDIA STAGE - FULL BLEED WINDOW WITH ULTRA-SILKY REVEAL & DISSOLVE EXIT */
            <motion.div
              key={filePath || 'active-stage'}
              initial={{ opacity: 0, scale: 0.97, filter: 'blur(10px) brightness(0.8)' }}
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px) brightness(1)' }}
              exit={{ opacity: 0, scale: 1.02, filter: 'blur(14px) brightness(0.6)' }}
              transition={{
                duration: 0.6,
                ease: [0.22, 1, 0.36, 1],
              }}
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}
            >
              {/* Premium Canvas Light Bloom Overlay on Media Entry */}
              <motion.div
                initial={{ opacity: 0.4, scale: 0.9 }}
                animate={{ opacity: 0, scale: 1.2 }}
                transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
                style={{
                  position: 'absolute',
                  inset: 0,
                  pointerEvents: 'none',
                  zIndex: 15,
                  background:
                    'radial-gradient(circle at 50% 50%, rgba(241,254,200,0.14), transparent 70%)',
                }}
              />
              {jobStatus === 'completed' && upscaledPath ? (
                <ComparisonSlider
                  originalPath={filePath}
                  upscaledPath={upscaledPath}
                  viewMode={comparisonViewMode}
                  zoom={zoomLevel}
                  onZoomChange={setZoomLevel}
                  onToggleViewMode={() =>
                    setComparisonViewMode((prev) => (prev === 'split' ? 'side-by-side' : 'split'))
                  }
                />
              ) : (
                <>
                  {isVideo ? (
                    <video
                      src={getMediaSrc(filePath)}
                      controls={jobStatus !== 'processing' && jobStatus !== 'queued'}
                      autoPlay={jobStatus === 'processing' || jobStatus === 'queued'}
                      loop
                      muted
                      style={{
                        position: 'absolute',
                        inset: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        filter:
                          jobStatus === 'processing' || jobStatus === 'queued'
                            ? 'opacity(0.3) blur(2px)'
                            : 'none',
                        transition: 'filter .2s ease',
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        backgroundImage: `url(${getMediaSrc(filePath)})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        backgroundRepeat: 'no-repeat',
                        filter:
                          jobStatus === 'processing' || jobStatus === 'queued'
                            ? 'opacity(0.3) blur(2px)'
                            : 'none',
                        transition: 'filter .2s ease',
                      }}
                    />
                  )}

                  {/* 8x6 Tile Grid Scanning Overlay matching HTML handoff */}
                  {(jobStatus === 'processing' || jobStatus === 'queued') && (
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'grid',
                        gridTemplateColumns: 'repeat(8, 1fr)',
                        gridTemplateRows: 'repeat(6, 1fr)',
                        gap: '1px',
                        pointerEvents: 'none',
                        zIndex: 10,
                      }}
                    >
                      {Array.from({ length: 48 }).map((_, i) => {
                        const cutoff = (progressVal / 100) * 48;
                        const state =
                          i < Math.floor(cutoff)
                            ? 'done'
                            : i < Math.ceil(cutoff)
                              ? 'active'
                              : 'pending';
                        return (
                          <div
                            key={i}
                            style={{
                              background:
                                state === 'done'
                                  ? 'transparent'
                                  : state === 'active'
                                    ? 'rgba(168,11,36,.16)'
                                    : 'rgba(9,8,8,.72)',
                              boxShadow: state === 'active' ? 'inset 0 0 0 1px #A80B24' : 'none',
                              transition: 'background .3s ease',
                            }}
                          />
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Top Floating Header Islands */}
      <Titlebar
        hasFiles={Boolean(filePath || batchItems.length > 0)}
        currentFile={filePath || (batchItems.length > 0 ? batchItems[0].fileName : null)}
        originalDims={currentFileDims}
        outputDims={
          currentFileDims ? { w: currentFileDims.w * scale, h: currentFileDims.h * scale } : null
        }
        isDone={jobStatus === 'completed'}
        selectedGpu={selectedGpu}
        availableGpus={gpus.map((g) => ({
          id: g.id,
          name: g.name,
          detail: g.detail || (g.id === 0 ? 'Default GPU' : 'Vulkan Device'),
        }))}
        onSelectGpu={setSelectedGpu}
        isVramOverflowing={isVramOverflowing}
        activeNavTab={activeNavTab}
        onToggleNavTab={handleToggleNavTab}
        onRemoveFile={handleClearFile}
      />

      {/* Left Queue Rail */}
      <BatchQueueView
        items={batchItems}
        selectedId={batchItems.find((b) => b.fileName === fileName)?.id}
        selectedScale={scale}
        currentFileDims={currentFileDims}
        onSelect={(id) => {
          const item = batchItems.find((b) => b.id === id);
          if (item && item.filePath && item.fileName) {
            setFilePath(item.filePath);
            setFileName(item.fileName);
            if (item.w && item.h) setCurrentFileDims({ w: item.w, h: item.h });
          }
        }}
        onAddFiles={handleOpenFile}
        onAddMoreFiles={handleOpenFile}
        onClear={handleClearFile}
        onClearCompleted={() =>
          setBatchItems((prev) =>
            prev.filter((b) => b.status !== 'done' && (b.status as string) !== 'completed')
          )
        }
        onRemoveItem={handleRemoveBatchItem}
      />

      {/* Bottom Floating Control Dock */}
      <div
        style={{
          position: 'absolute',
          bottom: 14,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 42,
        }}
      >
        <SettingsPanel
          supportedModels={supportedModels}
          category={category}
          onSelectCategory={handleSelectCategory}
          installedModels={installedModels}
          selectedModel={selectedModel}
          onSelectModel={handleSelectModel}
          scale={scale}
          onSelectScale={setScale}
          isProcessing={jobStatus === 'processing' || jobStatus === 'queued'}
          hasFiles={Boolean(filePath || batchItems.length > 0)}
          isBatchMode={batchItems.length > 1}
          onRun={handleStartUpscale}
          onCancel={() => handleCancelUpscale()}
          isMuted={isMuted}
          onToggleMute={handleToggleMute}
          onOpenCatalog={() => setActiveNavTab('models')}
        />
      </div>

      {/* Telemetry Progress Floating Overlay */}
      {(jobStatus === 'processing' || jobStatus === 'queued') && (
        <ProgressOverlay
          percentage={progressVal}
          statusText={statusMessage}
          phase={jobPhase || 'UPSCALE 4X'}
          etaSeconds={etaSeconds}
          fps={fps}
          rate={rateStr}
          vram={activeVramGb}
          tileCount={tileSize === 0 ? 'AUTO' : `${tileSize}px`}
          onCancel={() => handleCancelUpscale()}
        />
      )}

      {/* Completion Card Floating Banner */}
      {jobStatus === 'completed' && upscaledPath && (
        <CompletionCard
          outputPath={upscaledPath}
          outputDims={
            currentFileDims
              ? { w: currentFileDims.w * scale, h: currentFileDims.h * scale }
              : undefined
          }
          compareMode={comparisonViewMode === 'split' ? 'split' : 'side'}
          zoom={zoomLevel}
          onSetSplit={() => setComparisonViewMode('split')}
          onSetSide={() => setComparisonViewMode('side-by-side')}
          onCycleZoom={handleCycleZoom}
          onOpen={() => handleShowInExplorerNative(upscaledPath)}
          onReset={handleClearFile}
        />
      )}

      {/* Right Header Navigation Drawer Cards (Aligned to Top-Right below Nav Island) */}
      {activeNavTab && (
        <div
          style={{
            position: 'absolute',
            top: 56,
            right: 12,
            bottom: 78,
            width: 312,
            zIndex: 38,
            animation: 'slidein .3s var(--ease-spring) both',
          }}
        >
          {activeNavTab === 'settings' && (
            <AdvancedSettings
              gpus={gpus}
              selectedGpu={selectedGpu}
              onSelectGpu={setSelectedGpu}
              tileSize={tileSize}
              onSelectTileSize={setTileSize}
              customOutputPath={customOutputPath}
              onSetOutputDir={(dir) => setCustomOutputPath(dir)}
              onSelectOutputPath={handleSelectDestinationFolder}
              isProcessing={jobStatus === 'processing' || jobStatus === 'queued'}
              onAutoTune={(recTile, vramText) => {
                setTileSize(recTile);
                addToast(
                  'info',
                  'Auto-Tuned Tile Size',
                  `Set to ${recTile === 0 ? 'AUTO' : recTile + 'px'} based on ${vramText}`
                );
              }}
              onClose={() => setActiveNavTab(null)}
            />
          )}

          {activeNavTab === 'models' && (
            <ModelCatalogModal
              supportedModels={supportedModels}
              installedModelIds={installedModels}
              onDownloadModel={handleDownloadModel}
              downloadingModelId={downloadingModelId}
              downloadProgress={downloadProgress}
              onClose={() => setActiveNavTab(null)}
            />
          )}

          {activeNavTab === 'history' && (
            <RecentHistoryDrawer
              history={historyItems}
              onSelectHistoryItem={(item: HistoryEntry) => {
                handleLoadHistoryItem(item);
              }}
              onClose={() => setActiveNavTab(null)}
            />
          )}

          {activeNavTab === 'about' && <AboutModal onClose={() => setActiveNavTab(null)} />}
        </div>
      )}

      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}
