import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { motion, AnimatePresence } from "framer-motion";
import { XCircle, CheckCircle, Download, ArrowsClockwise, Image as ImageIcon, Video as VideoIcon, UploadSimple, ListPlus } from "@phosphor-icons/react";

import "./App.css";
import { LiquidShaderBg } from "./components/LiquidShaderBg";
import { Titlebar } from "./components/Titlebar";
import { DropZone } from "./components/DropZone";
import { FilePreview } from "./components/FilePreview";
import { SettingsPanel } from "./components/SettingsPanel";
import { AdvancedSettings } from "./components/AdvancedSettings";
import { UpscaleButton } from "./components/UpscaleButton";
import { ProgressOverlay } from "./components/ProgressOverlay";
import { ComparisonSlider } from "./components/ComparisonSlider";
import { CompletionCard } from "./components/CompletionCard";
import { ToastContainer, ToastItem } from "./components/ToastContainer";
import { UpdateBadge } from "./components/UpdateBadge";
import { playDropSound, playCompleteSound, playErrorSound } from "./lib/sound";

interface GpuDevice {
  id: number;
  name: string;
}

interface ModelItem {
  id: string;
  name: string;
  version: string;
  param_url: string;
  param_sha256: string;
  param_size: number;
  bin_url: string;
  bin_sha256: string;
  bin_size: number;
}

interface JobProgress {
  job_id: string;
  percentage: number;
  status: string;
  error: string | null;
  phase?: string;
  eta_seconds?: number;
  fps?: number;
}

interface DownloadProgressEvent {
  model_id: string;
  file_type: "param" | "bin";
  downloaded: number;
  total: number;
  percentage: number;
}

export default function App() {
  // --- STATE ---
  const [gpus, setGpus] = useState<GpuDevice[]>([]);
  const [selectedGpu, setSelectedGpu] = useState<number>(0);
  const [installedModels, setInstalledModels] = useState<string[]>([]);
  const [cloudModels, setCloudModels] = useState<ModelItem[]>([]);
  const [category, setCategory] = useState<"photos" | "anime" | "video">("photos");

  const [selectedModel, setSelectedModel] = useState<string>("");
  const [scale, setScale] = useState<number>(4);
  const [tileSize, setTileSize] = useState<number>(0); // 0 = Auto
  const [customOutputPath, setCustomOutputPath] = useState<string>("");

  // Sound Settings
  const [isMuted] = useState<boolean>(false);

  // File Details
  const [filePath, setFilePath] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const [fileSize, setFileSize] = useState<number>(0);
  const [isVideo, setIsVideo] = useState<boolean>(false);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [upscaledPath, setUpscaledPath] = useState<string>("");
  const pendingOutputPath = useRef<string>("");

  // Job Queue / Execution Status
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string>("idle"); // "idle", "queued", "processing", "completed", "failed", "cancelled"
  const [progressVal, setProgressVal] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [jobPhase, setJobPhase] = useState<string>("Initializing GPU Inference...");
  const [etaSeconds, setEtaSeconds] = useState<number | undefined>(undefined);
  const [fps, setFps] = useState<number | undefined>(undefined);

  // Model Updates & Downloads
  const [showModelManager, setShowModelManager] = useState<boolean>(false);
  const [downloadingModelId, setDownloadingModelId] = useState<string | null>(null);
  const [downloadPercentage, setDownloadPercentage] = useState<number>(0);
  const [downloadFileProgress, setDownloadFileProgress] = useState<string>("");
  const [updateAvailable] = useState<boolean>(true);
  const [latestVersion] = useState<string>("v0.3.0");

  // Toast Notifications
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = (
    type: "success" | "error" | "warning" | "info",
    message: string,
    suggestion?: string,
    onAutoFix?: () => void
  ) => {
    const id = Math.random().toString(36).substring(7);
    setToasts((prev) => [...prev, { id, type, message, suggestion, onAutoFix }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 6000);
  };

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // --- INITIALIZATION ---
  useEffect(() => {
    // 1. Fetch GPU list once on mount
    invoke<GpuDevice[]>("list_gpus")
      .then((res) => {
        setGpus(res);
        if (res.length > 0) {
          setSelectedGpu(res[0].id);
          addToast("info", `GPU Detected: ${res[0].name}`, "Vulkan acceleration is ready.");
        }
      })
      .catch((err) => console.error("Failed to load GPUs:", err));

    // 2. Fetch local installed models
    refreshInstalledModels();

    // 3. First-launch welcome toast
    const hasLaunched = localStorage.getItem("upscaly_launched");
    if (!hasLaunched) {
      localStorage.setItem("upscaly_launched", "true");
      setTimeout(() => {
        addToast("info", "Welcome to Upscaly", "Drag any photo or video here to start enhancing.");
      }, 800);
    }
  }, []);

  // Job and download event listeners
  useEffect(() => {
    const unlistenJob = listen<JobProgress>("job-status-changed", (event) => {
      const { job_id, percentage, status, error, phase, eta_seconds, fps: jobFps } = event.payload;

      if (activeJobId && job_id !== activeJobId) return;

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
        if (pendingOutputPath.current) {
          setUpscaledPath(pendingOutputPath.current);
        }
        setActiveJobId(null);
        refreshInstalledModels();
        playCompleteSound(isMuted);
        addToast("success", "Upscaling complete!", "Your enhanced media is ready for preview.");
      } else if (status === "failed") {
        setActiveJobId(null);
        setJobStatus("idle");
        playErrorSound(isMuted);
        const errStr = error || "Processing failed during sidecar execution.";
        addToast(
          "error",
          "Upscale Failed",
          errStr,
          errStr.includes("Out of Memory") || errStr.includes("VRAM")
            ? () => setTileSize(128)
            : undefined
        );
      } else if (status === "cancelled") {
        setActiveJobId(null);
        setJobStatus("idle");
        addToast("info", "Upscale Cancelled", "Temporary processing files have been cleaned up.");
      }
    });

    const unlistenDownload = listen<DownloadProgressEvent>("download-progress", (event) => {
      const { model_id, file_type, percentage, downloaded, total } = event.payload;
      setDownloadingModelId(model_id);
      setDownloadPercentage(percentage);
      setDownloadFileProgress(
        `Downloading ${file_type}: ${(downloaded / 1024 / 1024).toFixed(1)}MB / ${(total / 1024 / 1024).toFixed(1)}MB`
      );
    });

    return () => {
      unlistenJob.then((fn) => fn());
      unlistenDownload.then((fn) => fn());
    };
  }, [activeJobId, isMuted]);

  // --- KEYBOARD SHORTCUTS ---
  const handleKeyboard = useCallback(
    (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "o") {
        e.preventDefault();
        handleOpenFileDialog();
      }
      if ((e.key === "Enter" || e.key === " ") && filePath && jobStatus === "idle" && selectedModel) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
        e.preventDefault();
        handleStartUpscale();
      }
      if (e.key === "Escape") {
        if (jobStatus === "processing" || jobStatus === "queued") {
          handleCancelUpscale();
        } else if (filePath) {
          handleClearFile();
        }
      }
    },
    [filePath, jobStatus, selectedModel]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
  }, [handleKeyboard]);

  const refreshInstalledModels = () => {
    invoke<string[]>("get_installed_models")
      .then((res) => {
        setInstalledModels(res);
        if (res.length > 0 && !selectedModel) {
          setSelectedModel(res[0]);
        }
      })
      .catch((err) => console.error("Failed to load installed models:", err));
  };

  // --- ACTIONS ---
  const handleOpenFileDialog = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          { name: "Media Files", extensions: ["png", "jpg", "jpeg", "webp", "bmp", "mp4", "mkv", "avi", "mov"] },
          { name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "bmp"] },
          { name: "Videos", extensions: ["mp4", "mkv", "avi", "mov"] },
        ],
      });
      if (selected && typeof selected === "string") {
        setFilePath(selected);
        setUpscaledPath("");
        const name = selected.split(/[/\\]/).pop() || selected;
        setFileName(name);
        setFileSize(0);
        const isVid = selected.endsWith(".mp4") || selected.endsWith(".mkv") || selected.endsWith(".avi") || selected.endsWith(".mov");
        setIsVideo(isVid);
        if (isVid) setCategory("video");
        playDropSound(isMuted);
      }
    } catch (err) {
      console.error("Failed to open file dialog:", err);
    }
  };

  const handleFileDropObject = (fileObj: File) => {
    setFileName(fileObj.name);
    setFileSize(fileObj.size);
    setUpscaledPath("");

    const path = (fileObj as any).path || fileObj.name;
    setFilePath(path);

    const isVid = fileObj.type.startsWith("video/") || fileObj.name.endsWith(".mp4") || fileObj.name.endsWith(".mkv");
    setIsVideo(isVid);
    if (isVid) setCategory("video");
    playDropSound(isMuted);
  };

  const handleSelectCustomFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
      });
      if (selected && typeof selected === "string") {
        setCustomOutputPath(selected);
        addToast("info", "Output folder updated", selected);
      }
    } catch (err) {
      console.error("Failed to select folder:", err);
    }
  };

  const handleStartUpscale = async () => {
    if (!filePath || !selectedModel) return;

    const dotIdx = filePath.lastIndexOf(".");
    const ext = dotIdx !== -1 ? filePath.substring(dotIdx) : ".png";
    const base = dotIdx !== -1 ? filePath.substring(0, dotIdx) : filePath;
    const nameOnly = base.split(/[/\\]/).pop() || base;

    let output = `${base}_upscaled${ext}`;
    if (customOutputPath) {
      output = `${customOutputPath}/${nameOnly}_upscaled${ext}`;
    }
    pendingOutputPath.current = output;

    const jobId = Math.random().toString(36).substring(7);

    const jobConfig = {
      id: jobId,
      input_path: filePath,
      output_path: output,
      model_name: selectedModel,
      gpu_id: selectedGpu,
      scale: scale,
      tile_size: tileSize,
      is_video: isVideo,
    };

    setJobStatus("queued");
    setProgressVal(0);
    setActiveJobId(jobId);
    setStatusMessage("Queued in background thread...");

    try {
      await invoke("enqueue_job", { job: jobConfig });
    } catch (err: any) {
      setJobStatus("failed");
      setActiveJobId(null);
      playErrorSound(isMuted);
      addToast("error", "Failed to start upscale", err.toString());
    }
  };

  const handleCancelUpscale = async () => {
    if (!activeJobId) return;
    try {
      await invoke("cancel_active_job", { jobId: activeJobId });
      setJobStatus("cancelled");
      setActiveJobId(null);
    } catch (err: any) {
      console.error("Cancel failed:", err);
    }
  };

  const handleClearFile = () => {
    setFilePath("");
    setFileName("");
    setFileSize(0);
    setUpscaledPath("");
    setJobStatus("idle");
  };

  const handleResetState = () => {
    setFilePath("");
    setFileName("");
    setFileSize(0);
    setUpscaledPath("");
    setJobStatus("idle");
    setProgressVal(0);
  };

  const handleFetchManifest = async () => {
    const mockCloudModels: ModelItem[] = [
      {
        id: "realesrgan-x4plus",
        name: "RealESRGAN x4 Plus (Photo)",
        version: "v0.3.0",
        param_url: "https://raw.githubusercontent.com/xinntao/Real-ESRGAN/master/models/RealESRGAN_x4plus.param",
        param_sha256: "dummy-hash",
        param_size: 1548,
        bin_url: "https://raw.githubusercontent.com/xinntao/Real-ESRGAN/master/models/RealESRGAN_x4plus.bin",
        bin_sha256: "dummy-hash-bin",
        bin_size: 67108864,
      },
      {
        id: "realesrgan-x4plus-anime",
        name: "RealESRGAN x4 Plus Anime",
        version: "v0.3.0",
        param_url: "https://raw.githubusercontent.com/xinntao/Real-ESRGAN/master/models/RealESRGAN_x4plus_anime.param",
        param_sha256: "dummy-hash-anime",
        param_size: 1200,
        bin_url: "https://raw.githubusercontent.com/xinntao/Real-ESRGAN/master/models/RealESRGAN_x4plus_anime.bin",
        bin_sha256: "dummy-hash-bin-anime",
        bin_size: 16777216,
      },
    ];
    setCloudModels(mockCloudModels);
  };

  const handleDownloadModel = async (model: ModelItem) => {
    setDownloadingModelId(model.id);
    setDownloadPercentage(0);
    try {
      await invoke("download_model_files", { model });
      setDownloadingModelId(null);
      refreshInstalledModels();
      addToast("success", "Model installed!", `${model.name} is ready for use.`);
    } catch (err: any) {
      setDownloadingModelId(null);
      addToast("error", "Download failed", err.toString());
    }
  };

  return (
    <div
      className="relative h-screen w-screen flex flex-col text-[#F1FEC8] font-sans overflow-hidden bg-[#121018] select-none"
      style={{ isolation: "isolate" }}
    >
      {/* 60FPS Luminous Ambient Shader Canvas */}
      <LiquidShaderBg isProcessing={jobStatus === "processing"} />

      {/* Custom Header Titlebar */}
      <Titlebar
        onShowModelCatalog={() => {
          setShowModelManager(true);
          handleFetchManifest();
        }}
        onShowSettings={() => {}}
        onShowAbout={() => {}}
      />

      {/* Floating Toast Notification Stack */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* --- PRO TWO-COLUMN SPLIT DESKTOP WORKSPACE LAYOUT --- */}
      <main className="relative z-10 flex-1 flex overflow-hidden pt-13">
        {/* LEFT SIDEBAR: CONTROL & CONFIGURATION PANEL (380px Fixed Width) */}
        <aside className="w-[380px] shrink-0 border-r border-white/10 bg-[#16141D]/75 backdrop-blur-2xl p-5 flex flex-col justify-between overflow-y-auto space-y-4 shadow-2xl">
          <div className="space-y-4">
            {/* Optional Model Update Badge */}
            {updateAvailable && jobStatus === "idle" && (
              <div className="flex justify-center">
                <UpdateBadge
                  latestVersion={latestVersion}
                  onDownload={() => {
                    setShowModelManager(true);
                    handleFetchManifest();
                  }}
                  isDownloading={downloadingModelId !== null}
                  downloadPercentage={downloadPercentage}
                />
              </div>
            )}

            {/* Media Source Card / Small Select DropZone */}
            {filePath ? (
              <FilePreview
                filePath={filePath}
                fileName={fileName}
                fileSize={fileSize}
                isVideo={isVideo}
                scale={scale}
                onRemove={handleClearFile}
              />
            ) : (
              <div
                onClick={handleOpenFileDialog}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragOver(false);
                  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    handleFileDropObject(e.dataTransfer.files[0]);
                  }
                }}
                className={`p-6 rounded-3xl border border-dashed transition-all cursor-pointer text-center relative overflow-hidden backdrop-blur-xl ${
                  isDragOver
                    ? "border-[#F1FEC8] bg-[#36255C]/60 scale-[1.02]"
                    : "border-[#D2C3F6]/30 hover:border-[#D2C3F6]/60 bg-[#23212C]/60 hover:bg-[#23212C]/90"
                }`}
              >
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#36255C] to-[#5E3C98] border border-[#D2C3F6]/30 flex items-center justify-center mx-auto mb-3 shadow-lg">
                  <UploadSimple size={28} className="text-[#F1FEC8] animate-bounce" />
                </div>
                <h4 className="text-xs font-extrabold text-[#F1FEC8]">Select Source File</h4>
                <p className="text-[10px] text-[#D2C3F6]/70 mt-1 font-medium">Click to browse or drag photo/video here</p>
              </div>
            )}

            {/* AI Model & Parameter Settings */}
            <SettingsPanel
              category={category}
              onSelectCategory={setCategory}
              installedModels={installedModels}
              selectedModel={selectedModel}
              onSelectModel={setSelectedModel}
              scale={scale}
              onSelectScale={setScale}
            />

            {/* Advanced Hardware & VRAM Accordion */}
            <AdvancedSettings
              gpus={gpus}
              selectedGpu={selectedGpu}
              onSelectGpu={setSelectedGpu}
              tileSize={tileSize}
              onSelectTileSize={setTileSize}
              customOutputPath={customOutputPath}
              onSelectOutputPath={handleSelectCustomFolder}
            />
          </div>

          {/* Volumetric Glowing Action Button */}
          <div className="pt-2">
            <UpscaleButton
              disabled={!filePath || !selectedModel}
              isProcessing={jobStatus === "processing" || jobStatus === "queued"}
              onClick={handleStartUpscale}
            />
          </div>
        </aside>

        {/* RIGHT STAGE: INTERACTIVE MEDIA SHOWCASE & COMPARISON SANDBOX */}
        <section className="flex-1 bg-[#121018]/50 backdrop-blur-xl p-6 flex flex-col justify-center items-center overflow-y-auto relative">
          <AnimatePresence mode="wait">
            {/* STAGE 1: IDLE SHOWCASE & ATROPOS HERO CARD */}
            {jobStatus === "idle" && (
              <motion.div
                key="idle-stage"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.2 }}
                className="w-full max-w-2xl"
              >
                {!filePath ? (
                  <DropZone
                    onFileSelect={handleFileDropObject}
                    onBrowseClick={handleOpenFileDialog}
                    isDragOver={isDragOver}
                    setIsDragOver={setIsDragOver}
                  />
                ) : (
                  <div className="rounded-3xl liquid-glass border border-[#D2C3F6]/25 p-8 flex flex-col items-center justify-center text-center space-y-4 shadow-2xl backdrop-blur-2xl">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#36255C] to-[#5E3C98] border border-[#F1FEC8]/30 flex items-center justify-center text-[#F1FEC8] shadow-xl">
                      {isVideo ? <VideoIcon size={36} weight="duotone" /> : <ImageIcon size={36} weight="duotone" />}
                    </div>
                    <div>
                      <h3 className="text-base font-extrabold text-[#F1FEC8]">{fileName}</h3>
                      <p className="text-xs text-[#D2C3F6]/80 mt-1 font-mono">
                        Ready to enhance with <span className="text-[#F1FEC8] font-bold">{selectedModel}</span> ({scale}x scale)
                      </p>
                    </div>
                    <div className="pt-2">
                      <span className="text-[10px] font-mono font-bold px-3 py-1.5 rounded-full bg-[#36255C]/80 border border-[#D2C3F6]/30 text-[#F1FEC8] shadow">
                        Press "Upscale Media" to launch Vulkan GPU inference
                      </span>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* STAGE 2: PROCESSING & LIVE SCAN HUD */}
            {(jobStatus === "processing" || jobStatus === "queued") && (
              <motion.div
                key="processing-stage"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="w-full max-w-xl"
              >
                <ProgressOverlay
                  percentage={progressVal}
                  statusText={statusMessage}
                  phase={jobPhase}
                  etaSeconds={etaSeconds}
                  fps={fps}
                  onCancel={handleCancelUpscale}
                />
              </motion.div>
            )}

            {/* STAGE 3: COMPLETED RESULTS & COMPARISON SLIDER */}
            {jobStatus === "completed" && (
              <motion.div
                key="completed-stage"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="w-full max-w-3xl space-y-6"
              >
                <CompletionCard
                  outputPath={upscaledPath || pendingOutputPath.current}
                  onReset={handleResetState}
                />

                {!isVideo && (
                  <ComparisonSlider
                    originalPath={filePath}
                    upscaledPath={upscaledPath || pendingOutputPath.current}
                  />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </main>

      {/* --- MODEL MANAGER / CATALOG MODAL --- */}
      {showModelManager && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xl flex items-center justify-center p-6 select-none">
          <div className="w-full max-w-xl bg-[#16141D]/60 border border-white/10 rounded-3xl overflow-hidden flex flex-col max-h-[80vh] shadow-[0_12px_40px_rgba(0,0,0,0.6)] backdrop-blur-3xl relative">
            
            {/* Modal Ambient Glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[80%] h-32 bg-purple-500/20 rounded-[100%] blur-3xl pointer-events-none" />

            {/* Modal Header */}
            <div className="p-5 border-b border-white/5 flex items-center justify-between relative z-10 bg-black/20">
              <div>
                <h3 className="text-sm font-extrabold text-white uppercase tracking-widest flex items-center gap-2">
                  <ListPlus size={18} className="text-emerald-400" />
                  Model Catalog
                </h3>
                <p className="text-[10px] text-white/50 font-medium mt-1">Download, update, and manage AI model weights</p>
              </div>
              <button
                type="button"
                onClick={() => setShowModelManager(false)}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/5 text-white/50 hover:text-white hover:bg-rose-500/20 hover:border-rose-500/30 border border-transparent transition-all cursor-pointer active:scale-95"
              >
                <XCircle size={20} weight="fill" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1 relative z-10">
              {downloadingModelId && (
                <div className="bg-black/40 border border-purple-500/30 rounded-2xl p-5 space-y-3 shadow-[0_0_15px_rgba(168,85,247,0.1)]">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-purple-300 animate-pulse flex items-center gap-2">
                      <ArrowsClockwise size={14} className="animate-spin" />
                      Downloading weights...
                    </span>
                    <span className="font-mono text-white">{downloadPercentage.toFixed(1)}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-black rounded-full overflow-hidden border border-white/5">
                    <div
                      className="h-full bg-gradient-to-r from-purple-600 to-emerald-400 transition-all duration-150 relative"
                      style={{ width: `${downloadPercentage}%` }}
                    >
                      <div className="absolute inset-0 bg-white/20 w-full animate-shimmer" />
                    </div>
                  </div>
                  <p className="text-[10px] text-white/50 font-mono truncate">{downloadFileProgress}</p>
                </div>
              )}

              {/* Models List */}
              <div className="space-y-3">
                {cloudModels.length === 0 ? (
                  <div className="text-center py-12 text-white/30 space-y-3">
                    <ArrowsClockwise size={28} className="animate-spin mx-auto text-white/20" />
                    <p className="text-xs font-medium tracking-wide">Fetching model manifest...</p>
                  </div>
                ) : (
                  cloudModels.map((m) => {
                    const isInstalled = installedModels.includes(m.id);
                    const isDownloading = downloadingModelId === m.id;
                    const totalSizeMB = ((m.param_size + m.bin_size) / 1024 / 1024).toFixed(1);

                    return (
                      <div
                        key={m.id}
                        className="flex items-center justify-between p-4 bg-black/40 rounded-2xl border border-white/5 hover:border-white/10 transition-colors group"
                      >
                        <div>
                          <p className="text-sm font-bold text-white group-hover:text-emerald-50 transition-colors flex items-center gap-2">
                            {m.name}
                          </p>
                          <p className="text-[10px] text-white/40 mt-1 font-mono uppercase tracking-wider">
                            v{m.version} &bull; {totalSizeMB} MB
                          </p>
                        </div>

                        {isInstalled ? (
                          <span className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-bold uppercase tracking-wider bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-xl shadow-sm">
                            <CheckCircle size={14} weight="fill" />
                            <span>Installed</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={downloadingModelId !== null}
                            onClick={() => handleDownloadModel(m)}
                            className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider px-4 py-2 rounded-xl shadow transition-all duration-300 ${
                              isDownloading 
                                ? 'bg-black/40 text-white/40 border border-white/5 cursor-not-allowed'
                                : 'bg-white/5 hover:bg-white/10 text-white border border-white/10 hover:border-white/20 hover:shadow-[0_0_15px_rgba(255,255,255,0.1)] active:scale-95 cursor-pointer'
                            }`}
                          >
                            {isDownloading ? (
                              <ArrowsClockwise size={14} className="animate-spin" />
                            ) : (
                              <Download size={14} weight="bold" className={isDownloading ? '' : 'text-emerald-400'} />
                            )}
                            <span>{isDownloading ? "Downloading" : "Install"}</span>
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
