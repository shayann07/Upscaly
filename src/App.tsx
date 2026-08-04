import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { motion, AnimatePresence } from "framer-motion";

// Custom Components & Libs
import { Titlebar } from "./components/Titlebar";
import { DropZone } from "./components/DropZone";
import { ProgressOverlay } from "./components/ProgressOverlay";
import { CompletionCard } from "./components/CompletionCard";
import { SettingsPanel } from "./components/SettingsPanel";
import { AdvancedSettings } from "./components/AdvancedSettings";
import { ComparisonSlider } from "./components/ComparisonSlider";
import { ModelCatalogModal } from "./components/ModelCatalogModal";
import { ToastContainer, ToastItem } from "./components/ToastContainer";
import { RecentHistoryDrawer } from "./components/RecentHistoryDrawer";
import { AboutModal } from "./components/AboutModal";
import { BatchQueueView, BatchItem } from "./components/BatchQueueView";

import { playDropSound, playCompleteSound, playErrorSound } from "./lib/sound";
import { getMediaSrc } from "./lib/media";
import { getModelMetadata } from "./lib/models";
import { addHistoryItem, getRecentHistory, HistoryItem } from "./lib/history";

interface GpuDevice {
  id: number;
  name: string;
  detail?: string;
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

interface BackendSettings {
  default_gpu_id: number;
  default_scale: number;
  default_tile_size: number;
  output_directory: string | null;
  sound_muted: boolean;
  auto_check_updates: boolean;
}

const getMediaDimensions = (src: string, isVid: boolean): Promise<{ w: number; h: number }> => {
  return new Promise((resolve) => {
    if (isVid) {
      const vid = document.createElement("video");
      vid.src = src;
      vid.onloadedmetadata = () => {
        resolve({ w: vid.videoWidth || 1920, h: vid.videoHeight || 1080 });
      };
      vid.onerror = () => resolve({ w: 1920, h: 1080 });
    } else {
      const img = new Image();
      img.src = src;
      img.onload = () => {
        resolve({ w: img.width || 1920, h: img.height || 1080 });
      };
      img.onerror = () => resolve({ w: 1920, h: 1080 });
    }
  });
};

export default function App() {
  // --- STATE ---
  const [gpus, setGpus] = useState<GpuDevice[]>([]);
  const [selectedGpu, setSelectedGpu] = useState<number>(0);
  const [installedModels, setInstalledModels] = useState<string[]>([]);
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
  const [isVideo, setIsVideo] = useState<boolean>(false);
  const [currentFileDims, setCurrentFileDims] = useState<{ w: number; h: number } | null>(null);
  const [upscaledPath, setUpscaledPath] = useState<string>("");
  const [isDragOver] = useState<boolean>(false);
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);

  // Processing state
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string>("idle");
  const [progressVal, setProgressVal] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [jobPhase, setJobPhase] = useState<string>("");
  const [etaSeconds, setEtaSeconds] = useState<number | undefined>(undefined);
  const [fps, setFps] = useState<number | undefined>(undefined);

  // Studio Interactive Modes & Zoom
  const [comparisonViewMode, setComparisonViewMode] = useState<'split' | 'side-by-side'>('split');
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  // UI state
  const [showCatalogModal, setShowCatalogModal] = useState<boolean>(false);
  const [downloadingModelId, setDownloadingModelId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const isMuted = false;
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // History state
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>(() => getRecentHistory());

  const pendingOutputPath = useRef<string>("");
  const isInitialLoad = useRef<boolean>(true);

  const handleCycleZoom = () => {
    setZoomLevel((prev) => (prev === 1 ? 2 : prev === 2 ? 4 : prev === 4 ? 8 : 1));
  };

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

  // Initial load: GPUs, settings, models
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

    invoke<BackendSettings>("get_app_settings")
      .then((saved) => {
        if (saved) {
          if (saved.default_gpu_id !== undefined) setSelectedGpu(saved.default_gpu_id);
          if (saved.default_scale !== undefined) setScale(saved.default_scale);
          if (saved.default_tile_size !== undefined) setTileSize(saved.default_tile_size);
          if (saved.output_directory) setCustomOutputPath(saved.output_directory);
        }
      })
      .catch(() => {});

    refreshInstalledModels();
  }, []);

  // Save settings when user preferences change
  useEffect(() => {
    if (isInitialLoad.current) {
      isInitialLoad.current = false;
      return;
    }
    invoke("update_app_settings", {
      settings: {
        default_gpu_id: selectedGpu,
        default_scale: scale,
        default_tile_size: tileSize,
        output_directory: customOutputPath || null,
        sound_muted: false,
        auto_check_updates: true,
      },
    }).catch(() => {});
  }, [selectedGpu, scale, tileSize, customOutputPath]);

  // Global Keyboard Shortcuts (⌘O, ⌘↩, ESC, ⌘S, ⌘H)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "o") {
        e.preventDefault();
        handleOpenFile();
      } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleStartUpscale();
      } else if (e.key === "Escape") {
        if (activeJobId) {
          handleCancelUpscale();
        } else {
          setIsInspectorOpen(false);
          setIsHistoryOpen(false);
          setIsAboutOpen(false);
          setShowCatalogModal(false);
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        setIsInspectorOpen((prev) => !prev);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "h") {
        e.preventDefault();
        setIsHistoryOpen((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeJobId, filePath, batchItems]);

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
            const isFinished = status === "completed";
            const isErr = status === "failed";
            return {
              ...item,
              progress: percentage,
              status: isFinished ? "done" : isErr ? "error" : status === "processing" ? "processing" : "queued",
              outputPath: isFinished ? pendingOutputPath.current || item.outputPath : item.outputPath,
            };
          }
          return item;
        })
      );
    });

    const unlistenDownload = listen<DownloadProgressEvent>("download-progress", (event) => {
      const { model_id, percentage } = event.payload;
      setDownloadingModelId(model_id);
      setDownloadProgress(percentage);
      if (percentage >= 100) {
        setDownloadingModelId(null);
        setDownloadProgress(0);
        refreshInstalledModels();
        addToast("success", "Model Downloaded", `Model ${model_id} installed successfully.`);
      }
    });

    return () => {
      unlistenJob.then((f) => f());
      unlistenDownload.then((f) => f());
    };
  }, [activeJobId, filePath, fileName, upscaledPath, selectedModel, scale, isVideo, isMuted]);

  // File Select Handler
  const handleOpenFile = async () => {
    try {
      const selected = await open({
        multiple: true,
        filters: [
          {
            name: "Media Files",
            extensions: ["png", "jpg", "jpeg", "webp", "mp4", "mkv", "mov", "avi"],
          },
        ],
      });

      if (!selected) return;

      const paths = Array.isArray(selected) ? selected : [selected];
      if (paths.length === 0) return;

      playDropSound(isMuted);

      if (paths.length === 1) {
        const path = paths[0];
        const name = path.split(/[\\/]/).pop() || "media_file";
        const isVid = /\.(mp4|mkv|mov|avi)$/i.test(name);

        setFilePath(path);
        setFileName(name);
        setIsVideo(isVid);
        setUpscaledPath("");
        setJobStatus("idle");
        setProgressVal(0);
        setStatusMessage("");
        setJobPhase("");

        const dims = await getMediaDimensions(getMediaSrc(path), isVid);
        setCurrentFileDims(dims);

        const newBatchItem: BatchItem = {
          id: Math.random().toString(),
          filePath: path,
          fileName: name,
          w: dims.w,
          h: dims.h,
          fileSize: 1024 * 1024 * 5,
          isVideo: isVid,
          progress: 0,
          status: "ready",
          model: selectedModel,
        };
        setBatchItems([newBatchItem]);
        addToast("info", "File Loaded", `${name} (${dims.w}×${dims.h})`);
      } else {
        const newItems: BatchItem[] = [];
        for (const path of paths) {
          const name = path.split(/[\\/]/).pop() || "media_file";
          const isVid = /\.(mp4|mkv|mov|avi)$/i.test(name);
          const dims = await getMediaDimensions(getMediaSrc(path), isVid);
          newItems.push({
            id: Math.random().toString(),
            filePath: path,
            fileName: name,
            w: dims.w,
            h: dims.h,
            fileSize: 1024 * 1024 * 5,
            isVideo: isVid,
            progress: 0,
            status: "ready",
            model: selectedModel,
          });
        }

        setBatchItems((prev) => [...prev, ...newItems]);
        setFilePath(newItems[0].filePath || "");
        setFileName(newItems[0].fileName || "");
        setIsVideo(newItems[0].isVideo || false);
        setCurrentFileDims({ w: newItems[0].w || 1920, h: newItems[0].h || 1080 });
        addToast("info", "Batch Loaded", `Added ${paths.length} files to queue.`);
      }
    } catch (err) {
      console.error("Failed to pick files:", err);
      addToast("error", "File Picker Error", String(err));
    }
  };

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
      console.error("Failed to pick folder:", err);
    }
  };

  const handleClearFile = () => {
    setFilePath("");
    setFileName("");
    setIsVideo(false);
    setCurrentFileDims(null);
    setUpscaledPath("");
    setJobStatus("idle");
    setProgressVal(0);
    setStatusMessage("");
    setJobPhase("");
    setBatchItems([]);
    setZoomLevel(1);
    addToast("info", "Queue Cleared", "Ready for next input.");
  };

  const handleRemoveBatchItem = (id: string) => {
    setBatchItems((prev) => {
      const next = prev.filter((item) => item.id !== id);
      if (next.length === 0) {
        handleClearFile();
      } else if (filePath && !next.some((item) => item.filePath === filePath)) {
        setFilePath(next[0].filePath || "");
        setFileName(next[0].fileName || "");
        setIsVideo(next[0].isVideo || false);
        if (next[0].w && next[0].h) setCurrentFileDims({ w: next[0].w, h: next[0].h });
      }
      return next;
    });
  };

  // Start Upscale Logic
  const handleStartUpscale = async () => {
    if (batchItems.length > 1) {
      handleStartBatchUpscale();
      return;
    }

    if (!filePath) {
      addToast("warning", "No File Selected", "Please drag and drop or open an image/video first.");
      return;
    }

    try {
      setJobStatus("queued");
      setProgressVal(0);
      setStatusMessage("Queued in GPU worker thread...");
      setJobPhase("PREPARING");

      const ext = isVideo ? ".mp4" : ".png";
      const baseName = fileName.replace(/\.[^/.]+$/, "");
      const outputFilename = `${baseName}_upscaled_${scale}x${ext}`;

      let outPath = "";
      if (customOutputPath) {
        outPath = `${customOutputPath}/${outputFilename}`;
      } else {
        const lastSlash = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
        const parentDir = filePath.substring(0, lastSlash);
        outPath = `${parentDir}/${outputFilename}`;
      }

      pendingOutputPath.current = outPath;

      const jobId = await invoke<string>("run_upscale", {
        request: {
          input_path: filePath,
          output_path: outPath,
          model_id: selectedModel,
          gpu_id: selectedGpu,
          scale,
          tile_size: tileSize,
          is_video: isVideo,
        },
      });

      setActiveJobId(jobId);
      setJobStatus("processing");
      addToast("info", "Upscaling Started", `Job ID: ${jobId.slice(0, 8)}...`);
    } catch (err) {
      console.error("Upscale failed to start:", err);
      setJobStatus("idle");
      playErrorSound(isMuted);
      addToast("error", "Error Starting Upscale", String(err));
    }
  };

  // Batch Upscale Logic
  const handleStartBatchUpscale = async () => {
    const readyItems = batchItems.filter((i) => i.status === "ready" || i.status === "error" || (i.status as string) === "idle");
    if (readyItems.length === 0) {
      addToast("warning", "Queue Complete", "All items in batch have already completed.");
      return;
    }

    addToast("info", "Batch Started", `Processing ${readyItems.length} queued items...`);

    for (const item of readyItems) {
      if (!item.filePath || !item.fileName) continue;
      try {
        setBatchItems((prev) =>
          prev.map((b) => (b.id === item.id ? { ...b, status: "queued", progress: 0 } : b))
        );

        const isVid = Boolean(item.isVideo);
        const ext = isVid ? ".mp4" : ".png";
        const baseName = item.fileName.replace(/\.[^/.]+$/, "");
        const outputFilename = `${baseName}_upscaled_${scale}x${ext}`;

        let outPath = "";
        if (customOutputPath) {
          outPath = `${customOutputPath}/${outputFilename}`;
        } else {
          const lastSlash = Math.max(item.filePath.lastIndexOf("/"), item.filePath.lastIndexOf("\\"));
          const parentDir = item.filePath.substring(0, lastSlash);
          outPath = `${parentDir}/${outputFilename}`;
        }

        pendingOutputPath.current = outPath;

        setFilePath(item.filePath);
        setFileName(item.fileName);
        setIsVideo(Boolean(item.isVideo));
        if (item.w && item.h) setCurrentFileDims({ w: item.w, h: item.h });

        const jobId = await invoke<string>("run_upscale", {
          request: {
            input_path: item.filePath,
            output_path: outPath,
            model_id: selectedModel,
            gpu_id: selectedGpu,
            scale,
            tile_size: tileSize,
            is_video: isVid,
          },
        });

        setActiveJobId(jobId);
        setJobStatus("processing");

        setBatchItems((prev) =>
          prev.map((b) => (b.id === item.id ? { ...b, id: jobId, status: "processing" } : b))
        );

        await new Promise<void>((resolve) => {
          const checkDone = setInterval(() => {
            setBatchItems((currentItems) => {
              const current = currentItems.find((b) => b.id === jobId);
              if (!current || current.status === "done" || (current.status as string) === "completed" || current.status === "error") {
                clearInterval(checkDone);
                resolve();
              }
              return currentItems;
            });
          }, 300);
        });
      } catch (err) {
        console.error("Batch item failed:", err);
        setBatchItems((prev) =>
          prev.map((b) => (b.id === item.id ? { ...b, status: "error" } : b))
        );
      }
    }

    setActiveJobId(null);
    setJobStatus("completed");
    addToast("success", "Batch Complete", "All batch jobs processed.");
  };

  const handleCancelUpscale = async (idToCancel?: string) => {
    const targetId = idToCancel || activeJobId;
    if (!targetId) return;

    try {
      await invoke("cancel_upscale", { jobId: targetId });
      setActiveJobId(null);
      setJobStatus("idle");
      addToast("info", "Cancelled", "Upscaling process was cancelled.");
    } catch (err) {
      console.error("Failed to cancel job:", err);
    }
  };

  const handleDownloadModel = async (modelId: string) => {
    try {
      setDownloadingModelId(modelId);
      setDownloadProgress(5);
      addToast("info", "Downloading Model", `Fetching weights for ${modelId}...`);
      await invoke("download_model", { modelId });
    } catch (err) {
      console.error("Download failed:", err);
      setDownloadingModelId(null);
      setDownloadProgress(0);
      addToast("error", "Download Failed", String(err));
    }
  };

  const handleShowInExplorerNative = (path: string) => {
    revealItemInDir(path).catch((err: unknown) => {
      console.error("Failed to reveal item:", err);
      addToast("error", "Explorer Error", String(err));
    });
  };

  const handleLoadHistoryItem = (item: HistoryItem) => {
    setFilePath(item.originalPath);
    setFileName(item.fileName);
    setUpscaledPath(item.upscaledPath);
    setIsVideo(item.isVideo);
    setScale(item.scale);
    setJobStatus("completed");
    setIsHistoryOpen(false);
    setBatchItems([]);
    setZoomLevel(1);
    addToast("info", "Loaded from History", item.fileName);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--bg-stripe)", color: "var(--text-primary)", fontFamily: "var(--font-ui)", fontSize: "13px", overflow: "hidden", userSelect: "none", WebkitFontSmoothing: "antialiased" }}>

      {/* Center Workspace Canvas Stage - Full Bleed Window */}
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        <AnimatePresence mode="wait">
          {!filePath && batchItems.length === 0 ? (
            /* EMPTY DROPZONE STAGE */
            <motion.div
              key="empty-stage"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.2 }}
              style={{ position: "relative", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <div style={{ position: "absolute", inset: 0, background: "radial-gradient(105% 75% at 50% 45%, rgba(11,10,9,.55), rgba(11,10,9,.88) 78%)" }} />
              <DropZone
                isDragOver={isDragOver}
                onAddFiles={handleOpenFile}
                onAddBatch={handleOpenFile}
              />
            </motion.div>
          ) : (
            /* ACTIVE MEDIA STAGE - FULL BLEED WINDOW */
            <motion.div
              key="active-stage"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
              }}
            >
              {jobStatus === "completed" && upscaledPath ? (
                <ComparisonSlider
                  originalPath={filePath}
                  upscaledPath={upscaledPath}
                  viewMode={comparisonViewMode}
                  zoom={zoomLevel}
                  onZoomChange={setZoomLevel}
                  onToggleViewMode={() => setComparisonViewMode((prev) => (prev === 'split' ? 'side-by-side' : 'split'))}
                />
              ) : isVideo ? (
                <video
                  src={getMediaSrc(filePath)}
                  controls={jobStatus !== "processing" && jobStatus !== "queued"}
                  autoPlay={jobStatus === "processing" || jobStatus === "queued"}
                  loop
                  muted
                  className={`max-h-full max-w-full object-contain rounded-xl transition-all ${
                    jobStatus === "processing" || jobStatus === "queued" ? "opacity-30 blur-[2px]" : ""
                  }`}
                />
              ) : (
                <img
                  src={getMediaSrc(filePath)}
                  alt={fileName}
                  className={`max-h-full max-w-full object-contain rounded-xl transition-all ${
                    jobStatus === "processing" || jobStatus === "queued" ? "opacity-30 blur-[2px]" : ""
                  }`}
                />
              )}

              {/* 8x6 Tile Grid Overlay during Processing matching HTML handoff */}
              {(jobStatus === "processing" || jobStatus === "queued") && (
                <div style={{ position: "absolute", inset: 0, display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gridTemplateRows: "repeat(6, 1fr)", gap: "1px", pointerEvents: "none" }}>
                  {Array.from({ length: 48 }).map((_, i) => {
                    const cutoff = (progressVal / 100) * 48;
                    const state = i < Math.floor(cutoff) ? "done" : i < Math.ceil(cutoff) ? "active" : "pending";
                    return (
                      <div
                        key={i}
                        style={{
                          background: state === "done" ? "transparent" : state === "active" ? "rgba(168,11,36,.16)" : "rgba(9,8,8,.72)",
                          boxShadow: state === "active" ? "inset 0 0 0 1px #A80B24" : "none",
                          transition: "background .3s ease",
                        }}
                      />
                    );
                  })}
                </div>
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
        outputDims={currentFileDims ? { w: currentFileDims.w * scale, h: currentFileDims.h * scale } : null}
        isDone={jobStatus === "completed"}
        selectedGpu={selectedGpu}
        availableGpus={gpus.map((g) => ({ id: g.id, name: g.name, detail: g.detail || (g.id === 0 ? "Default GPU" : "Vulkan Device") }))}
        onSelectGpu={setSelectedGpu}
        settingsOpen={isInspectorOpen}
        onToggleSettings={() => setIsInspectorOpen(!isInspectorOpen)}
        onOpenCatalog={() => setShowCatalogModal(true)}
        onOpenHistory={() => setIsHistoryOpen(true)}
        onOpenAbout={() => setIsAboutOpen(true)}
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
        onClearCompleted={() => setBatchItems((prev) => prev.filter((b) => b.status !== "done" && (b.status as string) !== "completed"))}
        onRemoveItem={handleRemoveBatchItem}
      />

      {/* Bottom Floating Control Dock */}
      <div style={{ position: "absolute", bottom: 14, left: "50%", transform: "translateX(-50%)", zIndex: 42 }}>
        <SettingsPanel
          category={category}
          onSelectCategory={setCategory}
          installedModels={installedModels}
          selectedModel={selectedModel}
          onSelectModel={setSelectedModel}
          scale={scale}
          onSelectScale={setScale}
          isProcessing={jobStatus === "processing" || jobStatus === "queued"}
          hasFiles={Boolean(filePath || batchItems.length > 0)}
          isBatchMode={batchItems.length > 1}
          onRun={handleStartUpscale}
          onCancel={() => handleCancelUpscale()}
          onOpenCatalog={() => setShowCatalogModal(true)}
        />
      </div>

      {/* Telemetry Progress Floating Overlay */}
      {(jobStatus === "processing" || jobStatus === "queued") && (
        <ProgressOverlay
          percentage={progressVal}
          statusText={statusMessage}
          phase={jobPhase || "UPSCALE 4X"}
          etaSeconds={etaSeconds}
          fps={fps}
          onCancel={() => handleCancelUpscale()}
        />
      )}

      {/* Completion Card Floating Banner */}
      {jobStatus === "completed" && upscaledPath && (
        <CompletionCard
          outputPath={upscaledPath}
          outputDims={currentFileDims ? { w: currentFileDims.w * scale, h: currentFileDims.h * scale } : undefined}
          compareMode={comparisonViewMode === "split" ? "split" : "side"}
          zoom={zoomLevel}
          onSetSplit={() => setComparisonViewMode("split")}
          onSetSide={() => setComparisonViewMode("side-by-side")}
          onCycleZoom={handleCycleZoom}
          onOpen={() => handleShowInExplorerNative(upscaledPath)}
          onReset={handleClearFile}
        />
      )}

      {/* Right Inspector Panel Drawer */}
      {isInspectorOpen && (
        <div style={{ position: "absolute", top: 56, right: 12, bottom: 78, width: 312, zIndex: 38, animation: "slidein .3s var(--ease-spring) both" }}>
          <AdvancedSettings
            gpus={gpus}
            selectedGpu={selectedGpu}
            onSelectGpu={setSelectedGpu}
            tileSize={tileSize}
            onSelectTileSize={setTileSize}
            customOutputPath={customOutputPath}
            onSetOutputDir={(dir) => setCustomOutputPath(dir)}
            onSelectOutputPath={handleSelectDestinationFolder}
            isProcessing={jobStatus === "processing" || jobStatus === "queued"}
            onAutoTune={(recTile, vramText) => {
              setTileSize(recTile);
              addToast("info", "Auto-Tuned Tile Size", `Set to ${recTile === 0 ? "AUTO" : recTile + "px"} based on ${vramText}`);
            }}
            onClose={() => setIsInspectorOpen(false)}
          />
        </div>
      )}

      {/* Overlays & Modals */}
      {showCatalogModal && (
        <ModelCatalogModal
          isOpen={showCatalogModal}
          installedModelIds={installedModels}
          onDownloadModel={handleDownloadModel}
          downloadingModelId={downloadingModelId}
          downloadProgress={downloadProgress}
          onClose={() => setShowCatalogModal(false)}
        />
      )}

      {isHistoryOpen && (
        <RecentHistoryDrawer
          isOpen={isHistoryOpen}
          history={historyItems as any}
          onSelectHistoryItem={handleLoadHistoryItem}
          onClose={() => setIsHistoryOpen(false)}
        />
      )}

      {isAboutOpen && <AboutModal isOpen={isAboutOpen} onClose={() => setIsAboutOpen(false)} />}

      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}
