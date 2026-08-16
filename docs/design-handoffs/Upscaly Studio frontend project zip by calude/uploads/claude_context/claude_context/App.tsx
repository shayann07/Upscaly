import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { Play, Spinner } from "@phosphor-icons/react";
import { motion, AnimatePresence } from "framer-motion";

// Custom Components & Libs
import { Titlebar } from "./components/Titlebar";
import { DropZone } from "./components/DropZone";
import { FilePreview } from "./components/FilePreview";
import { ProgressOverlay } from "./components/ProgressOverlay";
import { CompletionCard } from "./components/CompletionCard";
import { SettingsPanel } from "./components/SettingsPanel";
import { AdvancedSettings } from "./components/AdvancedSettings";
import { ComparisonSlider } from "./components/ComparisonSlider";
import { ModelCatalogModal, ModelItem } from "./components/ModelCatalogModal";
import { ToastContainer, ToastItem } from "./components/ToastContainer";
import { RecentHistoryDrawer } from "./components/RecentHistoryDrawer";
import { AboutModal } from "./components/AboutModal";
import { BatchQueueView, BatchItem } from "./components/BatchQueueView";

import { playDropSound, playCompleteSound, playErrorSound } from "./lib/sound";
import { getMediaSrc } from "./lib/media";
import { MODEL_REGISTRY, getModelMetadata } from "./lib/models";
import { addHistoryItem, getRecentHistory, HistoryItem } from "./lib/history";

interface GpuDevice {
  id: number;
  name: string;
}

interface JobProgress {
  job_id: string;
  percentage: number;
  status: string;
  error?: string;
  phase?: string;
  eta_seconds?: number;
  fps?: number;
}

interface DownloadProgressEvent {
  model_id: string;
  percentage: number;
}

export default function App() {
  // --- STATE ---
  const [gpus, setGpus] = useState<GpuDevice[]>([]);
  const [selectedGpu, setSelectedGpu] = useState<number>(0);
  const [installedModels, setInstalledModels] = useState<string[]>([]);
  const [cloudModels, setCloudModels] = useState<ModelItem[]>([]);
  const [category, setCategory] = useState<"photos" | "anime" | "video">("photos");

  const [selectedModel, setSelectedModel] = useState<string>("realesrgan-x4plus");
  const [scale, setScale] = useState<number>(4);
  const [tileSize, setTileSize] = useState<number>(0); // 0 = Auto
  const [customOutputPath, setCustomOutputPath] = useState<string>("");
  const [isInspectorOpen, setIsInspectorOpen] = useState<boolean>(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);
  const [isAboutOpen, setIsAboutOpen] = useState<boolean>(false);

  // File & Batch state
  const [filePath, setFilePath] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const [fileSize, setFileSize] = useState<number>(0);
  const [isVideo, setIsVideo] = useState<boolean>(false);
  const [upscaledPath, setUpscaledPath] = useState<string>("");
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);

  // Processing state
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string>("idle");
  const [progressVal, setProgressVal] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [jobPhase, setJobPhase] = useState<string>("");
  const [etaSeconds, setEtaSeconds] = useState<number | undefined>(undefined);
  const [fps, setFps] = useState<number | undefined>(undefined);

  // Studio Interactive Modes
  const [comparisonViewMode, setComparisonViewMode] = useState<'split' | 'side-by-side'>('split');
  const [isHoldingOriginal, setIsHoldingOriginal] = useState<boolean>(false);

  // UI state
  const [showCatalogModal, setShowCatalogModal] = useState<boolean>(false);
  const [downloadingModelId, setDownloadingModelId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const isMuted = false;
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // History state
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>(() => getRecentHistory());

  const pendingOutputPath = useRef<string>("");

  // Toast Helpers
  const addToast = (type: "success" | "error" | "info" | "warning", heading: string, message: string) => {
    const cleanHeading = heading.replace(/[!:]+$/g, "").trim();
    const formattedMessage = message ? `${cleanHeading}: ${message}` : cleanHeading;
    const newToast: ToastItem = {
      id: Math.random().toString(),
      type,
      message: formattedMessage,
    };
    setToasts((prev) => [...prev, newToast]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Fetch installed models
  const refreshInstalledModels = () => {
    invoke<string[]>("list_installed_models")
      .then((models) => {
        setInstalledModels(models);
        if (models.length > 0 && (!selectedModel || !models.includes(selectedModel))) {
          setSelectedModel(models[0]);
        } else if (!selectedModel) {
          setSelectedModel("realesrgan-x4plus");
        }
      })
      .catch((err) => {
        console.error("Failed to fetch installed models:", err);
        if (!selectedModel) setSelectedModel("realesrgan-x4plus");
      });
  };

  // Initial load
  useEffect(() => {
    invoke<GpuDevice[]>("list_gpus")
      .then((res) => {
        setGpus(res);
        if (res.length > 0) {
          setSelectedGpu(res[0].id);
          addToast("info", `GPU Acceleration Ready`, `${res[0].name}`);
        }
      })
      .catch((err) => console.error("Failed to load GPUs:", err));

    refreshInstalledModels();
  }, []);

  // Job and download event listeners
  useEffect(() => {
    const unlistenJob = listen<JobProgress>("job-status-changed", (event) => {
      const { job_id, percentage, status, error, phase, eta_seconds, fps: jobFps } = event.payload;

      // Update single studio job
      if (activeJobId && job_id === activeJobId) {
        setProgressVal(percentage);
        setJobStatus(status);
        if (phase) setJobPhase(phase);
        if (eta_seconds !== undefined) setEtaSeconds(eta_seconds);
        if (jobFps !== undefined) setFps(jobFps);

        if (status === "processing") {
          setStatusMessage(`Upscaling in progress... ${percentage.toFixed(1)}%`);
        } else if (status === "queued") {
          setStatusMessage("Queued in GPU worker thread...");
        } else if (status === "completed") {
          setStatusMessage("Upscaling Completed Successfully!");
          const finalPath = pendingOutputPath.current || upscaledPath;
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
          setActiveJobId(null);
          refreshInstalledModels();
          playCompleteSound(isMuted);
          addToast("success", "Upscaling Complete", "Enhanced output saved.");
        } else if (status === "failed") {
          setActiveJobId(null);
          setJobStatus("idle");
          playErrorSound(isMuted);
          const errStr = error || "Processing failed during sidecar execution.";
          addToast("error", "Upscaling Failed", errStr);
        } else if (status === "cancelled") {
          setActiveJobId(null);
          setJobStatus("idle");
          addToast("info", "Cancelled", "Upscaling task was cancelled.");
        }
      }

      // Update batch queue items
      setBatchItems((prev) =>
        prev.map((item) => {
          if (item.id === job_id) {
            if (status === "completed" && item.upscaledPath) {
              const meta = getModelMetadata(selectedModel);
              addHistoryItem({
                fileName: item.fileName,
                originalPath: item.filePath,
                upscaledPath: item.upscaledPath,
                modelName: meta.name,
                scale,
                isVideo: item.isVideo,
              });
              setHistoryItems(getRecentHistory());
            }
            return {
              ...item,
              status: status as any,
              progress: percentage,
              statusMessage: phase || status,
              error: error || undefined,
            };
          }
          return item;
        })
      );
    });

    const unlistenDl = listen<DownloadProgressEvent>("model-download-progress", (event) => {
      setDownloadProgress(event.payload.percentage);
    });

    return () => {
      unlistenJob.then((f) => f());
      unlistenDl.then((f) => f());
    };
  }, [activeJobId, isMuted, selectedModel, scale, isVideo, fileName, filePath, upscaledPath]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        setIsHoldingOriginal(true);
      } else if (e.key === 's' || e.key === 'S') {
        if (!e.ctrlKey && !e.metaKey) {
          setComparisonViewMode((prev) => (prev === 'split' ? 'side-by-side' : 'split'));
        }
      } else if (e.key === 'Tab') {
        e.preventDefault();
        setIsInspectorOpen((prev) => !prev);
      } else if (e.key === '1') {
        setScale(2);
      } else if (e.key === '2') {
        setScale(3);
      } else if (e.key === '3') {
        setScale(4);
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'o' || e.key === 'O')) {
        e.preventDefault();
        handleOpenFile();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if ((filePath || batchItems.length > 0) && jobStatus === 'idle') {
          handleStartUpscale();
        }
      } else if (e.key === 'Escape') {
        if (showCatalogModal) setShowCatalogModal(false);
        if (isInspectorOpen) setIsInspectorOpen(false);
        if (isHistoryOpen) setIsHistoryOpen(false);
        if (isAboutOpen) setIsAboutOpen(false);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsHoldingOriginal(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [filePath, batchItems, jobStatus, showCatalogModal, isInspectorOpen, isHistoryOpen, isAboutOpen]);

  // Open file dialog (Supports single and multiple selection)
  const handleOpenFile = async () => {
    try {
      const selected = await open({
        multiple: true,
        filters: [
          {
            name: "Media Files",
            extensions: ["png", "jpg", "jpeg", "webp", "mp4", "mkv", "avi", "mov"],
          },
        ],
      });

      if (!selected) return;

      const filePaths = Array.isArray(selected) ? selected : [selected];
      if (filePaths.length === 1 && batchItems.length === 0) {
        // Single file mode
        const p = filePaths[0];
        const name = p.split(/[\\/]/).pop() || p;
        const isVid = /\.(mp4|mkv|avi|mov|webm)$/i.test(p);
        setFilePath(p);
        setFileName(name);
        setFileSize(0);
        setIsVideo(isVid);
        setUpscaledPath("");
        if (isVid) setCategory("video");
        playDropSound(isMuted);
        addToast("info", "File Selected", name);
      } else {
        // Multi-file batch mode
        const newBatch: BatchItem[] = filePaths.map((p) => {
          const name = p.split(/[\\/]/).pop() || p;
          const isVid = /\.(mp4|mkv|avi|mov|webm)$/i.test(p);
          return {
            id: `batch_${Math.random().toString(36).substring(2, 9)}`,
            filePath: p,
            fileName: name,
            fileSize: 0,
            isVideo: isVid,
            status: "idle",
            progress: 0,
          };
        });
        setBatchItems((prev) => [...prev, ...newBatch]);
        setFilePath("");
        playDropSound(isMuted);
        addToast("info", "Batch Queue Updated", `${filePaths.length} files added to queue`);
      }
    } catch (err) {
      console.error("Failed to select file:", err);
    }
  };

  const handleFileDropObject = (files: File[]) => {
    if (files.length === 1 && batchItems.length === 0) {
      const fileObj = files[0];
      setFileName(fileObj.name);
      setFileSize(fileObj.size);
      setUpscaledPath("");

      const blobUrl = URL.createObjectURL(fileObj);
      const path = (fileObj as any).path || blobUrl;
      setFilePath(path);

      const isVid = fileObj.type.startsWith("video/") || /\.(mp4|mkv|avi|mov|webm)$/i.test(fileObj.name);
      setIsVideo(isVid);
      if (isVid) setCategory("video");
      playDropSound(isMuted);
      addToast("info", "File Dropped", fileObj.name);
    } else {
      const newBatch: BatchItem[] = files.map((f) => {
        const blobUrl = URL.createObjectURL(f);
        const path = (f as any).path || blobUrl;
        const isVid = f.type.startsWith("video/") || /\.(mp4|mkv|avi|mov|webm)$/i.test(f.name);
        return {
          id: `batch_${Math.random().toString(36).substring(2, 9)}`,
          filePath: path,
          fileName: f.name,
          fileSize: f.size,
          isVideo: isVid,
          status: "idle",
          progress: 0,
        };
      });
      setBatchItems((prev) => [...prev, ...newBatch]);
      setFilePath("");
      playDropSound(isMuted);
      addToast("info", "Batch Dropped", `${files.length} files added to queue`);
    }
  };

  // Clear single loaded file or entire batch
  const handleClearFile = () => {
    setFilePath("");
    setFileName("");
    setFileSize(0);
    setUpscaledPath("");
    setJobStatus("idle");
    setActiveJobId(null);
    setBatchItems([]);
  };

  const handleRemoveBatchItem = (id: string) => {
    setBatchItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleClearCompletedBatch = () => {
    setBatchItems((prev) => prev.filter((i) => i.status !== 'completed'));
  };

  // Start upscale job (Single or Batch)
  const handleStartUpscale = async () => {
    if (!selectedModel) return;

    if (batchItems.length > 0) {
      // Start batch upscaling for all idle/failed/cancelled items
      for (const item of batchItems) {
        if (item.status === 'completed' || item.status === 'processing' || item.status === 'queued') continue;

        const pathParts = item.filePath.split(/[\\/]/);
        const originalFileName = pathParts.pop() || "upscaled_media";
        const parentDir = pathParts.join("/");

        const extIdx = originalFileName.lastIndexOf(".");
        const nameNoExt = extIdx !== -1 ? originalFileName.substring(0, extIdx) : originalFileName;
        const ext = extIdx !== -1 ? originalFileName.substring(extIdx) : item.isVideo ? ".mp4" : ".png";

        const outDir = customOutputPath || `${parentDir}/Upscaly_Outputs`;
        const targetPath = `${outDir}/${nameNoExt}_${scale}x_${selectedModel}${ext}`;

        try {
          const jobId = await invoke<string>("upscale_image", {
            inputPath: item.filePath,
            outputPath: targetPath,
            modelName: selectedModel,
            gpuId: selectedGpu,
            scale: scale,
            tileSize: tileSize,
            isVideo: item.isVideo,
          });

          setBatchItems((prev) =>
            prev.map((bi) =>
              bi.id === item.id ? { ...bi, id: jobId, status: 'queued', upscaledPath: targetPath } : bi
            )
          );
        } catch (err) {
          console.error("Failed to submit batch job:", err);
          setBatchItems((prev) =>
            prev.map((bi) =>
              bi.id === item.id ? { ...bi, status: 'failed', error: String(err) } : bi
            )
          );
        }
      }
      addToast("info", "Batch Enqueued", `Submitted files to GPU engine queue`);
    } else if (filePath) {
      // Single file upscale logic
      try {
        setJobStatus("queued");
        setProgressVal(0);
        setStatusMessage("Queuing job in Rust Vulkan worker...");
        setJobPhase("Queued in GPU worker thread...");
        setEtaSeconds(undefined);

        const pathParts = filePath.split(/[\\/]/);
        const originalFileName = pathParts.pop() || "upscaled_media";
        const dirPath = pathParts.join("/");

        const extIdx = originalFileName.lastIndexOf(".");
        const nameNoExt = extIdx !== -1 ? originalFileName.substring(0, extIdx) : originalFileName;
        const ext = extIdx !== -1 ? originalFileName.substring(extIdx) : isVideo ? ".mp4" : ".png";

        const outDir = customOutputPath || `${dirPath}/Upscaly_Outputs`;
        const targetPath = `${outDir}/${nameNoExt}_${scale}x_${selectedModel}${ext}`;
        pendingOutputPath.current = targetPath;

        const jobId = await invoke<string>("upscale_image", {
          inputPath: filePath,
          outputPath: targetPath,
          modelName: selectedModel,
          gpuId: selectedGpu,
          scale: scale,
          tileSize: tileSize,
          isVideo: isVideo,
        });

        setActiveJobId(jobId);
      } catch (err: any) {
        console.error("Failed to submit upscale job:", err);
        setJobStatus("idle");
        playErrorSound(isMuted);
        addToast("error", "Execution Failed", String(err));
      }
    }
  };

  // Cancel running job
  const handleCancelUpscale = async (id?: string) => {
    const targetId = id || activeJobId;
    if (targetId) {
      try {
        await invoke("cancel_upscale", { jobId: targetId });
        if (targetId === activeJobId) {
          setActiveJobId(null);
          setJobStatus("idle");
        }
        setBatchItems((prev) =>
          prev.map((bi) => (bi.id === targetId ? { ...bi, status: 'cancelled' } : bi))
        );
        addToast("info", "Cancelled", "Upscaling task was cancelled.");
      } catch (err) {
        console.error("Failed to cancel job:", err);
      }
    }
  };

  // Open destination folder picker
  const handleSelectDestinationFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
      });
      if (selected && typeof selected === "string") {
        setCustomOutputPath(selected);
        addToast("info", "Output Folder Set", selected);
      }
    } catch (err) {
      console.error("Failed to pick destination folder:", err);
    }
  };

  const handleOpenFileNative = async (path: string) => {
    try {
      await invoke('open_file_native', { path });
    } catch (err) {
      await openPath(path);
    }
  };

  const handleShowInExplorerNative = async (path: string) => {
    try {
      await invoke('show_in_explorer_native', { path });
    } catch (err) {
      await revealItemInDir(path);
    }
  };

  // Model catalog handlers
  const handleOpenCatalog = async () => {
    setShowCatalogModal(true);
    try {
      const models = await invoke<ModelItem[]>("list_available_models");
      if (models && models.length > 0) {
        setCloudModels(models);
        return;
      }
    } catch (err) {
      console.warn("Failed to fetch remote catalog, using local registry fallback:", err);
    }
    const fallbackList: ModelItem[] = Object.values(MODEL_REGISTRY).map((m) => ({
      id: m.id,
      name: m.name,
      version: "v0.2.5",
      param_url: `https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/${m.id}.param`,
      param_sha256: "",
      param_size: 15408,
      bin_url: `https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/${m.id}.bin`,
      bin_sha256: "",
      bin_size: 17000000,
    }));
    setCloudModels(fallbackList);
  };

  const handleDownloadModel = async (modelId: string) => {
    setDownloadingModelId(modelId);
    setDownloadProgress(0);
    try {
      const modelObj = cloudModels.find((m) => m.id === modelId) || {
        id: modelId,
        name: modelId,
        version: "v0.2.5",
        param_url: `https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/${modelId}.param`,
        param_sha256: "",
        param_size: 15408,
        bin_url: `https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/${modelId}.bin`,
        bin_sha256: "",
        bin_size: 17000000,
      };

      await invoke("download_model_files", { model: modelObj });
      addToast("success", "Model Downloaded", `Successfully downloaded ${modelId}`);
      refreshInstalledModels();
    } catch (err: any) {
      console.error("Model download failed:", err);
      addToast("error", "Download Failed", String(err));
    } finally {
      setDownloadingModelId(null);
    }
  };

  // Select item from Recent History Drawer
  const handleSelectHistoryItem = (item: HistoryItem) => {
    setFileName(item.fileName);
    setFilePath(item.originalPath);
    setUpscaledPath(item.upscaledPath);
    setIsVideo(item.isVideo);
    setScale(item.scale);
    setJobStatus("completed");
    setIsHistoryOpen(false);
    setBatchItems([]);
    addToast("info", "Loaded from History", item.fileName);
  };

  return (
    <div className="w-screen h-screen bg-[#0A0A0D] flex flex-col text-zinc-100 overflow-hidden select-none font-sans">
      {/* Titlebar Header */}
      <Titlebar
        onShowModelCatalog={handleOpenCatalog}
        onShowSettings={() => setIsInspectorOpen(true)}
        onShowAbout={() => setIsAboutOpen(true)}
        onShowHistory={() => setIsHistoryOpen(true)}
        onToggleInspector={() => setIsInspectorOpen(!isInspectorOpen)}
        isInspectorOpen={isInspectorOpen}
      />

      {/* Main Workspace Body */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Main Canvas Stage */}
        <div className="flex-1 flex flex-col items-center justify-center p-3 relative overflow-hidden min-h-0 w-full">
          <AnimatePresence mode="wait">
            {!filePath && batchItems.length === 0 ? (
              /* EMPTY DROPZONE STAGE */
              <motion.div
                key="empty-stage"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.2 }}
                className="w-full max-w-2xl"
              >
                <DropZone
                  onFileSelect={handleFileDropObject}
                  onBrowseClick={handleOpenFile}
                  isDragOver={isDragOver}
                  setIsDragOver={setIsDragOver}
                />
              </motion.div>
            ) : batchItems.length > 0 ? (
              /* BATCH QUEUE GRID STAGE */
              <motion.div
                key="batch-stage"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.2 }}
                className="w-full h-full flex flex-col items-center justify-center relative min-h-0 max-w-5xl"
              >
                <BatchQueueView
                  items={batchItems}
                  onRemoveItem={handleRemoveBatchItem}
                  onClearCompleted={handleClearCompletedBatch}
                  onAddMoreFiles={handleOpenFile}
                  onOpenFileNative={handleOpenFileNative}
                  onShowInExplorerNative={handleShowInExplorerNative}
                  onCancelItem={(id) => handleCancelUpscale(id)}
                />
              </motion.div>
            ) : (
              /* UNIFIED SINGLE STUDIO STAGE */
              <motion.div
                key="active-stage"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.2 }}
                className="w-full h-full flex flex-col items-center justify-center relative min-h-0 max-w-5xl"
              >
                {/* File Header Bar */}
                <div className="w-full mb-2 shrink-0">
                  <FilePreview
                    filePath={filePath}
                    fileName={fileName}
                    fileSize={fileSize}
                    isVideo={isVideo}
                    scale={scale}
                    onRemove={handleClearFile}
                  />
                </div>

                {/* Unified Main Viewport Box */}
                <div className="flex-1 w-full rounded-2xl overflow-hidden bg-[#141419] border border-[#272730] shadow-2xl relative min-h-0 flex items-center justify-center p-2">
                  {jobStatus === "completed" && upscaledPath ? (
                    <ComparisonSlider
                      originalPath={filePath}
                      upscaledPath={upscaledPath}
                      viewMode={comparisonViewMode}
                      onToggleViewMode={() => setComparisonViewMode((prev) => (prev === 'split' ? 'side-by-side' : 'split'))}
                      isHoldingOriginal={isHoldingOriginal}
                    />
                  ) : (
                    isVideo ? (
                      <video
                        src={getMediaSrc(filePath)}
                        controls={jobStatus !== "processing" && jobStatus !== "queued"}
                        autoPlay={jobStatus === "processing" || jobStatus === "queued"}
                        loop
                        muted
                        className={`max-h-[62vh] max-w-full object-contain rounded-xl transition-all ${
                          jobStatus === "processing" || jobStatus === "queued" ? "opacity-30 blur-[2px]" : ""
                        }`}
                      />
                    ) : (
                      <img
                        src={getMediaSrc(filePath)}
                        alt={fileName}
                        className={`max-h-[62vh] max-w-full object-contain rounded-xl transition-all ${
                          jobStatus === "processing" || jobStatus === "queued" ? "opacity-30 blur-[2px]" : ""
                        }`}
                      />
                    )
                  )}

                  {/* Frosted Glass Progress Overlay */}
                  {(jobStatus === "processing" || jobStatus === "queued") && (
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 z-30">
                      <ProgressOverlay
                        percentage={progressVal}
                        statusText={statusMessage}
                        phase={jobPhase}
                        etaSeconds={etaSeconds}
                        fps={fps}
                        onCancel={() => handleCancelUpscale()}
                      />
                    </div>
                  )}

                  {/* Floating Completion Card */}
                  {jobStatus === "completed" && upscaledPath && (
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 max-w-lg w-11/12">
                      <CompletionCard
                        outputPath={upscaledPath}
                        onReset={handleClearFile}
                      />
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Studio Inspector Panel */}
        {isInspectorOpen && (
          <AdvancedSettings
            gpus={gpus}
            selectedGpu={selectedGpu}
            onSelectGpu={setSelectedGpu}
            tileSize={tileSize}
            onSelectTileSize={setTileSize}
            customOutputPath={customOutputPath}
            onSelectOutputPath={handleSelectDestinationFolder}
            onClose={() => setIsInspectorOpen(false)}
          />
        )}
      </div>

      {/* Bottom Floating Control Dock */}
      {(filePath || batchItems.length > 0) && (
        <div className="p-3 bg-[#0F0F12] border-t border-[#272730] flex items-center justify-center relative z-40">
          <div className="w-full max-w-3xl flex items-center justify-between gap-4">
            <SettingsPanel
              category={category}
              onSelectCategory={setCategory}
              installedModels={installedModels}
              selectedModel={selectedModel}
              onSelectModel={setSelectedModel}
              scale={scale}
              onSelectScale={setScale}
            />

            {/* Start Upscale Action Button */}
            <button
              type="button"
              onClick={handleStartUpscale}
              disabled={jobStatus === "processing" || jobStatus === "queued"}
              className={`px-6 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 shadow-lg transition-all cursor-pointer ${
                jobStatus === "processing" || jobStatus === "queued"
                  ? "bg-indigo-900/50 text-indigo-300 border border-indigo-500/30 cursor-not-allowed"
                  : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30 hover:scale-105 active:scale-95"
              }`}
            >
              {jobStatus === "processing" || jobStatus === "queued" ? (
                <>
                  <Spinner size={16} className="animate-spin" />
                  <span>Processing...</span>
                </>
              ) : batchItems.length > 0 ? (
                <>
                  <Play size={16} weight="fill" />
                  <span>Upscale Batch ({batchItems.length})</span>
                </>
              ) : (
                <>
                  <Play size={16} weight="fill" />
                  <span>Upscale Media</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Slide-over Drawers & Modals */}
      <RecentHistoryDrawer
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        history={historyItems}
        onSelectHistoryItem={handleSelectHistoryItem}
        onClearHistory={() => {
          localStorage.removeItem('upscaly_history');
          setHistoryItems([]);
        }}
      />

      <AboutModal
        isOpen={isAboutOpen}
        onClose={() => setIsAboutOpen(false)}
      />

      <ModelCatalogModal
        isOpen={showCatalogModal}
        onClose={() => setShowCatalogModal(false)}
        cloudModels={cloudModels}
        installedModelIds={installedModels}
        onDownloadModel={handleDownloadModel}
        downloadingModelId={downloadingModelId}
        downloadProgress={downloadProgress}
      />

      {/* Global Toast Container */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}
