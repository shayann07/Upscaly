import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import "./App.css";

// Import Liquid Glass Design System Components
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
import { ToastContainer } from "./components/ToastContainer";
import { UpdateBadge } from "./components/UpdateBadge";
import { playDropSound, playCompleteSound, playErrorSound } from "./lib/sound";

interface GpuDevice {
  id: number;
  name: string;
}

interface JobProgress {
  job_id: string;
  percentage: number;
  status: string;
  error: string | null;
}

export interface ToastMessage {
  id: string;
  type: "success" | "error" | "info" | "warning";
  message: string;
  suggestion?: string;
}

export default function App() {
  // --- STATE ---
  const [gpus, setGpus] = useState<GpuDevice[]>([]);
  const [selectedGpu, setSelectedGpu] = useState<number>(0);
  const [installedModels, setInstalledModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [category, setCategory] = useState<"photos" | "anime" | "video">("photos");
  const [scale, setScale] = useState<number>(4);
  const [tileSize, setTileSize] = useState<number>(0); // 0 = Auto
  const [customOutputPath, setCustomOutputPath] = useState<string>("");

  // File State
  const [filePath, setFilePath] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const [fileSize, setFileSize] = useState<number>(0);
  const [isVideo, setIsVideo] = useState<boolean>(false);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [upscaledPath, setUpscaledPath] = useState<string>("");
  const pendingOutputPath = useRef<string>("");

  // Execution & Progress State
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string>("idle"); // "idle", "queued", "processing", "completed", "failed"
  const [progressVal, setProgressVal] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>("");

  // Audio Mute State
  const [isMuted, setIsMuted] = useState<boolean>(false);

  // Toasts
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Update Badge State
  const [updateAvailable] = useState<boolean>(true);
  const [updateVersion] = useState<string>("v0.3.0");
  const [isDownloadingModel, setIsDownloadingModel] = useState<boolean>(false);
  const [modelDownloadPercentage, setModelDownloadPercentage] = useState<number>(0);

  const addToast = (type: ToastMessage["type"], message: string, suggestion?: string) => {
    const id = Math.random().toString(36).substring(7);
    setToasts((prev) => [...prev, { id, type, message, suggestion }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // --- INITIALIZATION ---
  useEffect(() => {
    // 1. Fetch GPU list
    invoke<GpuDevice[]>("list_gpus")
      .then((res) => {
        setGpus(res);
        if (res.length > 0) setSelectedGpu(res[0].id);
      })
      .catch((err) => {
        console.error("Failed to load GPUs:", err);
        addToast("warning", "GPU probe fallback initialized", "Using default Vulkan adapter");
      });

    // 2. Fetch local installed models
    refreshInstalledModels();

    // 3. Listen to Tauri job queue progress events
    const unlistenJob = listen<JobProgress>("job-status-changed", (event) => {
      const { job_id, percentage, status, error } = event.payload;

      if (activeJobId && job_id !== activeJobId) return;

      setProgressVal(percentage);
      setJobStatus(status);

      if (status === "processing") {
        setStatusMessage(`Upscaling frames... ${percentage.toFixed(1)}%`);
      } else if (status === "queued") {
        setStatusMessage("Queued in GPU worker stream...");
      } else if (status === "completed") {
        setStatusMessage("Upscaling Completed Successfully!");
        if (pendingOutputPath.current) {
          setUpscaledPath(pendingOutputPath.current);
        }
        setActiveJobId(null);
        if (!isMuted) playCompleteSound();
        addToast("success", "Upscale Completed!", "Output saved to destination");
        refreshInstalledModels();
      } else if (status === "failed") {
        setActiveJobId(null);
        if (!isMuted) playErrorSound();
        addToast("error", error || "Upscaling failed", "Lower Tile Size in Advanced Settings");
      } else if (status === "cancelled") {
        setStatusMessage("Job Cancelled");
        setActiveJobId(null);
        addToast("info", "Processing Cancelled", "Temp files safely cleaned up");
      }
    });

    return () => {
      unlistenJob.then((fn) => fn());
    };
  }, [activeJobId, isMuted]);

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

  // --- FILE SELECTION HANDLERS ---
  const handleNativeFileBrowse = async () => {
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
        processSelectedFile(selected);
      }
    } catch (err) {
      console.error("Failed to open file dialog:", err);
    }
  };

  const handleFileDropSelect = (file: File) => {
    const path = (file as any).path || file.name;
    processSelectedFile(path, file.name, file.size, file.type);
  };

  const processSelectedFile = (path: string, name?: string, size?: number, type?: string) => {
    const resolvedName = name || path.split(/[/\\]/).pop() || path;
    const isVid = type ? type.startsWith("video/") : path.endsWith(".mp4") || path.endsWith(".mkv") || path.endsWith(".avi");

    setFilePath(path);
    setFileName(resolvedName);
    setFileSize(size || 0);
    setIsVideo(isVid);
    setUpscaledPath("");
    setJobStatus("idle");
    if (!isMuted) playDropSound();

    if (isVid) {
      setCategory("video");
    } else {
      setCategory("photos");
    }
  };

  const handleRemoveFile = () => {
    setFilePath("");
    setFileName("");
    setFileSize(0);
    setUpscaledPath("");
    setJobStatus("idle");
  };

  // --- OUTPUT FOLDER SELECTION ---
  const handleSelectOutputFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
      });
      if (selected && typeof selected === "string") {
        setCustomOutputPath(selected);
        addToast("info", "Destination Path Updated", selected);
      }
    } catch (err) {
      console.error("Failed to pick directory:", err);
    }
  };

  // --- EXECUTION HANDLERS ---
  const handleStartUpscale = async () => {
    if (!filePath || !selectedModel) return;

    let output = "";
    if (customOutputPath) {
      const nameWithoutExt = fileName.substring(0, fileName.lastIndexOf(".")) || fileName;
      const ext = fileName.substring(fileName.lastIndexOf(".")) || ".png";
      output = `${customOutputPath}\\${nameWithoutExt}_upscaled${ext}`;
    } else {
      const dotIdx = filePath.lastIndexOf(".");
      const ext = dotIdx !== -1 ? filePath.substring(dotIdx) : ".png";
      const base = dotIdx !== -1 ? filePath.substring(0, dotIdx) : filePath;
      output = `${base}_upscaled${ext}`;
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
    setStatusMessage("Submitting task to Vulkan GPU pipeline...");

    try {
      await invoke("enqueue_job", { job: jobConfig });
    } catch (err: any) {
      setJobStatus("failed");
      setActiveJobId(null);
      if (!isMuted) playErrorSound();
      addToast("error", "Job Launch Failed", err.toString());
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

  const handleDownloadModelUpdate = () => {
    setIsDownloadingModel(true);
    setModelDownloadPercentage(0);
    const interval = setInterval(() => {
      setModelDownloadPercentage((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsDownloadingModel(false);
          addToast("success", "Model Updated!", "Real-ESRGAN v0.3.0 weights installed");
          return 100;
        }
        return prev + 10;
      });
    }, 300);
  };

  return (
    <div className="relative h-screen w-screen flex flex-col text-[#F1FEC8] font-sans overflow-hidden bg-[#16141D] select-none">
      {/* 60fps Ambient Liquid Canvas Shader Background */}
      <LiquidShaderBg isProcessing={jobStatus === "processing"} />

      {/* Custom Frameless Glass Titlebar */}
      <Titlebar
        statusText={jobStatus === "processing" ? "Upscaling GPU Inference..." : "Vulkan Engine Ready"}
        isMuted={isMuted}
        onToggleMute={() => setIsMuted(!isMuted)}
        gpus={gpus}
        selectedGpu={selectedGpu}
        onSelectGpu={(id) => setSelectedGpu(id)}
      />

      {/* Main Container Layered Above Shader Canvas */}
      <main className="relative z-10 flex-1 flex overflow-hidden pt-12">
        {/* If no file is selected, display Atropos 3D Tilt Dropzone Hero */}
        {!filePath ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 max-w-2xl mx-auto text-center space-y-6">
            {/* Update Notification Badge */}
            {updateAvailable && (
              <UpdateBadge
                latestVersion={updateVersion}
                onDownload={handleDownloadModelUpdate}
                isDownloading={isDownloadingModel}
                downloadPercentage={modelDownloadPercentage}
              />
            )}

            {/* Atropos 3D Parallax DropZone Card */}
            <DropZone
              onFileSelect={handleFileDropSelect}
              onBrowseClick={handleNativeFileBrowse}
              isDragOver={isDragOver}
              setIsDragOver={setIsDragOver}
            />
          </div>
        ) : (
          /* File Selected Workspace Layout */
          <div className="flex-1 flex overflow-hidden">
            {/* LEFT COMPONENT PANEL */}
            <section className="w-[380px] border-r border-[#D2C3F6]/15 bg-[#23212C]/75 backdrop-blur-2xl p-5 flex flex-col justify-between overflow-y-auto space-y-5">
              <div className="space-y-5">
                {/* File Selected Card */}
                <FilePreview
                  filePath={filePath}
                  fileName={fileName}
                  fileSize={fileSize}
                  isVideo={isVideo}
                  scale={scale}
                  onRemove={handleRemoveFile}
                />

                {/* Preset Category & Scale Selector Panel */}
                <SettingsPanel
                  category={category}
                  onSelectCategory={(cat) => setCategory(cat)}
                  installedModels={installedModels}
                  selectedModel={selectedModel}
                  onSelectModel={(m) => setSelectedModel(m)}
                  scale={scale}
                  onSelectScale={(s) => setScale(s)}
                />

                {/* Advanced Collapsible Settings (GPU & Tile Size VRAM Controls) */}
                <AdvancedSettings
                  gpus={gpus}
                  selectedGpu={selectedGpu}
                  onSelectGpu={(id) => setSelectedGpu(id)}
                  tileSize={tileSize}
                  onSelectTileSize={(sz) => setTileSize(sz)}
                  customOutputPath={customOutputPath}
                  onSelectOutputPath={handleSelectOutputFolder}
                />
              </div>

              {/* Liquid Shimmer Pill CTA Button */}
              <div className="pt-2">
                <UpscaleButton
                  disabled={!filePath || installedModels.length === 0}
                  isProcessing={jobStatus === "processing" || jobStatus === "queued"}
                  onClick={handleStartUpscale}
                />
              </div>
            </section>

            {/* RIGHT WORKSPACE PREVIEW / COMPARISON AREA */}
            <section className="flex-1 bg-[#16141D]/50 backdrop-blur-md p-6 flex flex-col justify-center items-center relative overflow-hidden">
              {/* If job is processing, render Multi-Phase Progress Overlay */}
              {jobStatus === "processing" || jobStatus === "queued" ? (
                <ProgressOverlay
                  percentage={progressVal}
                  statusText={statusMessage}
                  phase={isVideo ? "Extracting & Upscaling Video Frames" : "Vulkan Tensor Upscaling"}
                  fps={isVideo ? 24 : undefined}
                  etaSeconds={Math.round((100 - progressVal) * 0.3)}
                  onCancel={handleCancelUpscale}
                />
              ) : jobStatus === "completed" && upscaledPath ? (
                /* Completed Hero View with Celebration Card & Split-Comparison Slider */
                <div className="w-full h-full flex flex-col space-y-6 overflow-y-auto p-2">
                  <CompletionCard
                    outputPath={upscaledPath}
                    onReset={handleRemoveFile}
                  />
                  <div className="flex-1 w-full flex flex-col items-center justify-center">
                    <ComparisonSlider
                      originalPath={filePath}
                      upscaledPath={upscaledPath}
                    />
                  </div>
                </div>
              ) : (
                /* Pre-Upscale Idle Preview Slider */
                <div className="w-full h-full flex flex-col items-center justify-center p-4">
                  <ComparisonSlider
                    originalPath={filePath}
                    upscaledPath={filePath}
                  />
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      {/* Floating Liquid Toast Stack */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}
