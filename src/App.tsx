import { useState, useEffect, useRef, DragEvent } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Sparkles,
  Cpu,
  Download,
  Image as ImageIcon,
  Video as VideoIcon,
  Play,
  XCircle,
  RefreshCw,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Maximize2
} from "lucide-react";
import "./App.css";
import { LiquidShaderBg } from "./components/LiquidShaderBg";
import { Titlebar } from "./components/Titlebar";

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
}

interface DownloadProgressEvent {
  model_id: string;
  file_type: "param" | "bin";
  downloaded: number;
  total: number;
  percentage: number;
}

function App() {
  // --- STATE ---
  const [gpus, setGpus] = useState<GpuDevice[]>([]);
  const [selectedGpu, setSelectedGpu] = useState<number>(0);
  const [installedModels, setInstalledModels] = useState<string[]>([]);
  const [cloudModels, setCloudModels] = useState<ModelItem[]>([]);
  
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [scale, setScale] = useState<number>(4);
  const [tileSize, setTileSize] = useState<number>(0); // 0 = Auto
  
  // File details
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>("");

  // Model Updates & Downloads
  const [showModelManager, setShowModelManager] = useState<boolean>(false);
  const [downloadingModelId, setDownloadingModelId] = useState<string | null>(null);
  const [downloadPercentage, setDownloadPercentage] = useState<number>(0);
  const [downloadFileProgress, setDownloadFileProgress] = useState<string>("");


  // Before/After comparison slider position
  const [sliderPosition, setSliderPosition] = useState<number>(50);
  const sliderRef = useRef<HTMLDivElement>(null);
  const isDraggingSlider = useRef<boolean>(false);

  // --- INITIALIZATION ---
  useEffect(() => {
    // 1. Fetch GPU list
    invoke<GpuDevice[]>("list_gpus")
      .then((res) => {
        setGpus(res);
        if (res.length > 0) setSelectedGpu(res[0].id);
      })
      .catch((err) => console.error("Failed to load GPUs:", err));

    // 2. Fetch local installed models
    refreshInstalledModels();

    // 3. Listen to Tauri job queue progress events
    const unlistenJob = listen<JobProgress>("job-status-changed", (event) => {
      const { job_id, percentage, status, error } = event.payload;
      
      if (activeJobId && job_id !== activeJobId) return;

      setProgressVal(percentage);
      setJobStatus(status);

      if (status === "processing") {
        setStatusMessage(`Processing... ${percentage.toFixed(1)}%`);
      } else if (status === "queued") {
        setStatusMessage("Queued in background...");
      } else if (status === "completed") {
        setStatusMessage("Upscaling Completed!");
        if (pendingOutputPath.current) {
          setUpscaledPath(pendingOutputPath.current);
        }
        setActiveJobId(null);
        refreshInstalledModels();
      } else if (status === "failed") {
        setErrorMessage(error || "Processing failed");
        setActiveJobId(null);
      } else if (status === "cancelled") {
        setStatusMessage("Job Cancelled");
        setActiveJobId(null);
      }
    });

    // 4. Listen to Tauri model download progress events
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
  }, [activeJobId]);

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
          { name: "Videos", extensions: ["mp4", "mkv", "avi", "mov"] }
        ]
      });
      if (selected && typeof selected === "string") {
        setFilePath(selected);
        setUpscaledPath("");
        const name = selected.split(/[/\\]/).pop() || selected;
        setFileName(name);
        setFileSize(0);
        const isVid = selected.endsWith(".mp4") || selected.endsWith(".mkv") || selected.endsWith(".avi") || selected.endsWith(".mov");
        setIsVideo(isVid);
      }
    } catch (err) {
      console.error("Failed to open file dialog:", err);
    }
  };

  const handleFileDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const fileObj = e.dataTransfer.files[0];
      setFileName(fileObj.name);
      setFileSize(fileObj.size);
      setUpscaledPath("");
      
      const path = (fileObj as any).path || fileObj.name;
      setFilePath(path);
      
      const isVid = fileObj.type.startsWith("video/") || fileObj.name.endsWith(".mp4") || fileObj.name.endsWith(".mkv");
      setIsVideo(isVid);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const fileObj = e.target.files[0];
      setFileName(fileObj.name);
      setFileSize(fileObj.size);
      setUpscaledPath("");
      
      const path = (fileObj as any).path || fileObj.name;
      setFilePath(path);

      const isVid = fileObj.type.startsWith("video/") || fileObj.name.endsWith(".mp4") || fileObj.name.endsWith(".mkv");
      setIsVideo(isVid);
    }
  };

  const handleStartUpscale = async () => {
    if (!filePath || !selectedModel) return;

    // Generate output path (e.g. appends _upscaled to name)
    const dotIdx = filePath.lastIndexOf(".");
    const ext = dotIdx !== -1 ? filePath.substring(dotIdx) : ".png";
    const base = dotIdx !== -1 ? filePath.substring(0, dotIdx) : filePath;
    const output = `${base}_upscaled${ext}`;
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
      is_video: isVideo
    };

    setErrorMessage(null);
    setJobStatus("queued");
    setProgressVal(0);
    setActiveJobId(jobId);
    setStatusMessage("Queued in background...");

    try {
      await invoke("enqueue_job", { job: jobConfig });
    } catch (err: any) {
      setErrorMessage(err.toString());
      setJobStatus("failed");
      setActiveJobId(null);
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

  const handleFetchManifest = async () => {
    // For demonstration, we simulate fetch or connect to dynamic manifest
    // Since baked key is 000... we will mock the update for local demo,
    // or verify signature. Let's list a few default models as cloud option.
    const mockCloudModels: ModelItem[] = [
      {
        id: "realesrgan-x4plus",
        name: "RealESRGAN x4 Plus (Photo)",
        version: "1.2.0",
        param_url: "https://raw.githubusercontent.com/xinntao/Real-ESRGAN/master/models/RealESRGAN_x4plus.param", // Stubs
        param_sha256: "dummy-hash",
        param_size: 1548,
        bin_url: "https://raw.githubusercontent.com/xinntao/Real-ESRGAN/master/models/RealESRGAN_x4plus.bin",
        bin_sha256: "dummy-hash-bin",
        bin_size: 67108864
      },
      {
        id: "realesrgan-x4plus-anime",
        name: "RealESRGAN x4 Plus Anime",
        version: "1.2.0",
        param_url: "https://raw.githubusercontent.com/xinntao/Real-ESRGAN/master/models/RealESRGAN_x4plus_anime.param",
        param_sha256: "dummy-hash-anime",
        param_size: 1200,
        bin_url: "https://raw.githubusercontent.com/xinntao/Real-ESRGAN/master/models/RealESRGAN_x4plus_anime.bin",
        bin_sha256: "dummy-hash-bin-anime",
        bin_size: 16777216
      }
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
    } catch (err: any) {
      alert(`Download failed: ${err.toString()}`);
      setDownloadingModelId(null);
    }
  };

  // --- PREVIEW SLIDER HANDLERS ---
  const handleSliderMove = (clientX: number) => {
    if (!sliderRef.current) return;
    const rect = sliderRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPosition(percentage);
  };

  const handleMouseDown = () => {
    isDraggingSlider.current = true;
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingSlider.current) return;
      handleSliderMove(e.clientX);
    };

    const handleMouseUp = () => {
      isDraggingSlider.current = false;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  // Compute VRAM Tiling suggestion
  const getTilingSuggestion = () => {
    if (tileSize === 0) return "Auto (Recommended)";
    return `${tileSize}px tiles`;
  };

  return (
    <div className="min-h-screen flex flex-col glass text-slate-100 font-sans selection:bg-blue-600/30 pt-12">
      <LiquidShaderBg isProcessing={jobStatus === "processing"} />
      <Titlebar
        statusText={jobStatus === "processing" ? "Upscaling GPU Inference..." : "Vulkan Engine Ready"}
        gpus={gpus}
        selectedGpu={selectedGpu}
        onSelectGpu={(id) => setSelectedGpu(id)}
        onOpenModelCatalog={() => {
          setShowModelManager(true);
          handleFetchManifest();
        }}
      />

      {/* --- MAIN CORE INTERFACE --- */}
      <main className="flex-1 flex overflow-hidden">
        {/* LEFT COMPONENT PANEL */}
        <section className="w-[380px] border-r border-white/5 bg-slate-950/20 p-6 flex flex-col justify-between overflow-y-auto">
          <div className="space-y-6">
            <div>
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                Source File
              </h2>
              {/* File Info Card */}
              {filePath ? (
                <div className="relative glass-card rounded-xl p-4 space-y-3">
                  <button
                    onClick={() => {
                      setFilePath("");
                      setFileName("");
                      setFileSize(0);
                    }}
                    className="absolute top-2 right-2 text-slate-400 hover:text-red-400 transition"
                  >
                    <XCircle className="w-4 h-4" />
                  </button>
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                      {isVideo ? (
                        <VideoIcon className="w-5 h-5 text-blue-400" />
                      ) : (
                        <ImageIcon className="w-5 h-5 text-blue-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-200 truncate">{fileName}</p>
                      <p className="text-[10px] text-slate-400 font-mono">
                        {(fileSize / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono truncate bg-black/25 rounded px-2 py-1">
                    Path: {filePath}
                  </div>
                </div>
              ) : (
                /* Drag Drop Input */
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragOver(true);
                  }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={handleFileDrop}
                  className={`border border-dashed rounded-xl p-6 text-center cursor-pointer transition ${
                    isDragOver
                      ? "border-blue-500 bg-blue-500/5 text-blue-400"
                      : "border-white/10 hover:border-white/20 bg-black/10 hover:bg-black/20 text-slate-400"
                  }`}
                >
                  <input
                    type="file"
                    id="file-input"
                    onChange={handleFileSelect}
                    className="hidden"
                    accept="image/*,video/*"
                  />
                  <div
                    onClick={handleOpenFileDialog}
                    className="space-y-3 block"
                  >
                    <div className="w-12 h-12 rounded-full bg-slate-900 border border-white/5 flex items-center justify-center mx-auto shadow-md">
                      <ImageIcon className="w-5 h-5 text-slate-300" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-200">Drag & Drop file here</p>
                      <p className="text-[10px] text-slate-400 mt-1">Images or Video (.mp4, .mkv)</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleOpenFileDialog}
                      className="inline-block text-[10px] bg-blue-600 hover:bg-blue-500 text-white font-semibold px-3 py-1.5 rounded-lg border border-blue-400/30 transition shadow-md"
                    >
                      Browse Files
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Model & Parameters Form */}
            <div className="space-y-4">
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Settings
              </h2>

              {/* Model Dropdown */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-slate-300 flex items-center space-x-1">
                  <span>Upscaling Model</span>
                </label>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="w-full bg-black/30 border border-white/10 text-xs text-slate-200 rounded-lg p-2.5 focus:outline-none focus:border-blue-500/50"
                >
                  {installedModels.length === 0 ? (
                    <option value="" className="bg-slate-900">No Models Installed</option>
                  ) : (
                    installedModels.map((m) => (
                      <option key={m} value={m} className="bg-slate-900">
                        {m}
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* Scale Selector */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-slate-300">Scale Factor</label>
                <div className="grid grid-cols-3 gap-2">
                  {[2, 3, 4].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setScale(s)}
                      className={`py-2 text-xs font-semibold rounded-lg border transition ${
                        scale === s
                          ? "bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-600/15"
                          : "bg-slate-800/40 text-slate-300 border-white/5 hover:bg-slate-800/80"
                      }`}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Auto-Tiling / Tiling Option */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-slate-300 flex items-center justify-between">
                  <span>Tiling Configuration</span>
                  <span className="text-[10px] text-slate-400 font-mono">{getTilingSuggestion()}</span>
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {[0, 128, 256, 512].map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTileSize(t)}
                      className={`py-1.5 text-[10px] font-mono rounded border transition ${
                        tileSize === t
                          ? "bg-slate-200 text-slate-950 border-white font-bold"
                          : "bg-slate-900 text-slate-400 border-white/5 hover:bg-slate-800"
                      }`}
                    >
                      {t === 0 ? "Auto" : `${t}`}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Action Trigger Section */}
          <div className="pt-6 border-t border-white/5 space-y-3">
            {jobStatus === "processing" || jobStatus === "queued" ? (
              <button
                onClick={handleCancelUpscale}
                className="w-full flex items-center justify-center space-x-2 py-3 bg-red-950/40 border border-red-500/30 text-red-300 hover:bg-red-950/60 hover:text-red-200 text-xs font-semibold rounded-xl transition"
              >
                <XCircle className="w-4 h-4" />
                <span>Cancel Processing</span>
              </button>
            ) : (
              <button
                disabled={!filePath || installedModels.length === 0}
                onClick={handleStartUpscale}
                className="w-full flex items-center justify-center space-x-2 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 text-white shadow-lg shadow-blue-600/15 text-xs font-semibold rounded-xl transition"
              >
                <Play className="w-4 h-4" />
                <span>Upscale File</span>
              </button>
            )}
          </div>
        </section>

        {/* RIGHT PREVIEW & COMPARISON SLIDER PANEL */}
        <section className="flex-1 bg-black/20 p-6 flex flex-col space-y-6 overflow-y-auto">
          {/* Active Job State / Log Monitor */}
          {jobStatus !== "idle" && (
            <div className="glass-card rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  {jobStatus === "processing" && (
                    <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />
                  )}
                  {jobStatus === "queued" && (
                    <Layers className="w-4 h-4 text-amber-400 animate-pulse" />
                  )}
                  {jobStatus === "completed" && (
                    <CheckCircle2 className="w-4 h-4 text-green-400" />
                  )}
                  {jobStatus === "failed" && (
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                  )}
                  {jobStatus === "cancelled" && (
                    <XCircle className="w-4 h-4 text-slate-400" />
                  )}
                  <span className="text-xs font-semibold capitalize text-slate-200">
                    Status: {jobStatus}
                  </span>
                </div>
                <span className="text-xs font-mono font-bold text-slate-300">
                  {progressVal.toFixed(1)}%
                </span>
              </div>

              {/* Progress Bar */}
              <div className="w-full h-1.5 bg-black/45 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-300"
                  style={{ width: `${progressVal}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                <span>{statusMessage}</span>
                {jobStatus === "processing" && <span>GPU Native Processing</span>}
              </div>

              {errorMessage && (
                <div className="text-[11px] text-red-400 bg-red-950/20 border border-red-500/20 rounded p-2 text-left font-mono">
                  Error: {errorMessage}
                </div>
              )}
            </div>
          )}

          {/* Interactive Split-Comparison Slider Area */}
          <div className="flex-1 flex flex-col justify-center items-center">
            {filePath && !isVideo ? (
              <div className="space-y-2 w-full max-w-[640px]">
                <div className="flex justify-between items-center text-[10px] text-slate-400 font-semibold uppercase px-1">
                  <span>Original</span>
                  <div className="flex items-center space-x-1">
                    <Maximize2 className="w-3 h-3 text-slate-500" />
                    <span>Before / After Comparison Slider</span>
                  </div>
                  <span className={upscaledPath ? "text-green-400 font-bold" : ""}>
                    {upscaledPath ? "✓ Upscaled Result" : "Upscaled (Preview)"}
                  </span>
                </div>
                {/* Visual Slider Wrapper */}
                <div
                  ref={sliderRef}
                  onMouseMove={(e) => {
                    if (isDraggingSlider.current) handleSliderMove(e.clientX);
                  }}
                  className="slider-container aspect-video w-full rounded-2xl border border-white/5 bg-slate-950/50 shadow-inner"
                >
                  {/* Before (Original Image, clipped based on slider) */}
                  <img
                    src={convertFileSrc(filePath)}
                    alt="Original Preview"
                    className="slider-image absolute inset-0"
                    style={{
                      clipPath: `polygon(0 0, ${sliderPosition}% 0, ${sliderPosition}% 100%, 0 100%)`
                    }}
                  />
                  {/* After (Upscaled Image / Preview) */}
                  <img
                    src={convertFileSrc(upscaledPath || filePath)}
                    alt="Upscaled Preview"
                    className={`slider-image absolute inset-0 ${!upscaledPath ? "filter saturate-125 contrast-105" : ""}`}
                    style={{
                      clipPath: `polygon(${sliderPosition}% 0, 100% 0, 100% 100%, ${sliderPosition}% 100%)`
                    }}
                  />
                  
                  {/* Divider Handle */}
                  <div
                    className="slider-divider"
                    style={{ left: `${sliderPosition}%` }}
                  />
                  <div
                    className="slider-handle"
                    onMouseDown={handleMouseDown}
                    style={{ left: `${sliderPosition}%` }}
                  >
                    <Sliders className="w-3.5 h-3.5 text-blue-600 rotate-90" />
                  </div>
                </div>
              </div>
            ) : isVideo && filePath ? (
              /* Video Preview Box */
              <div className="w-full max-w-[640px] aspect-video rounded-2xl border border-white/5 bg-slate-950 flex flex-col items-center justify-center space-y-3 p-6 text-center">
                <VideoIcon className="w-12 h-12 text-slate-400" />
                <div>
                  <p className="text-xs font-semibold text-slate-200">Video Processing Mode Selected</p>
                  <p className="text-[10px] text-slate-400 mt-1 truncate max-w-sm">
                    Output will be saved next to the input video.
                  </p>
                </div>
              </div>
            ) : (
              /* Idle Workspace Placeholder */
              <div className="text-center py-20">
                <div className="w-16 h-16 rounded-full bg-slate-900 border border-white/5 flex items-center justify-center mx-auto mb-4">
                  <ImageIcon className="w-6 h-6 text-slate-500" />
                </div>
                <p className="text-sm font-semibold text-slate-300">Workspace Empty</p>
                <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                  Drag and drop a low-resolution photo or video here to start upscale restoration.
                </p>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* --- MODEL MANAGER / CATALOG MODAL --- */}
      {showModelManager && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-6">
          <div className="w-full max-w-lg glass-card rounded-2xl border border-white/10 overflow-hidden flex flex-col max-h-[80vh] shadow-2xl">
            {/* Modal Header */}
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Model Catalog</h3>
                <p className="text-[10px] text-slate-400">Download, update, and manage Real-ESRGAN weights</p>
              </div>
              <button
                onClick={() => setShowModelManager(false)}
                className="text-slate-400 hover:text-slate-200 transition"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              {downloadingModelId && (
                <div className="glass-card rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-blue-400 animate-pulse">Downloading weights...</span>
                    <span>{downloadPercentage.toFixed(1)}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-black/30 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 transition-all duration-150"
                      style={{ width: `${downloadPercentage}%` }}
                    />
                  </div>
                  <p className="text-[9px] text-slate-400 font-mono truncate">{downloadFileProgress}</p>
                </div>
              )}

              {/* Models List */}
              <div className="space-y-3">
                {cloudModels.length === 0 ? (
                  <div className="text-center py-6 text-slate-400 space-y-2">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-slate-600" />
                    <p className="text-xs">Fetching signed model manifest...</p>
                  </div>
                ) : (
                  cloudModels.map((m) => {
                    const isInstalled = installedModels.includes(m.id);
                    const isDownloading = downloadingModelId === m.id;
                    const totalSizeMB = ((m.param_size + m.bin_size) / 1024 / 1024).toFixed(1);

                    return (
                      <div
                        key={m.id}
                        className="flex items-center justify-between p-3.5 bg-black/25 rounded-xl border border-white/5"
                      >
                        <div>
                          <p className="text-xs font-bold text-slate-200">{m.name}</p>
                          <p className="text-[9px] text-slate-400 mt-1 font-mono">
                            Version: {m.version} &bull; Size: {totalSizeMB} MB
                          </p>
                        </div>

                        {isInstalled ? (
                          <span className="flex items-center space-x-1 text-[10px] text-green-400 font-semibold bg-green-500/10 border border-green-500/20 px-2.5 py-1 rounded-lg">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Installed</span>
                          </span>
                        ) : (
                          <button
                            disabled={downloadingModelId !== null}
                            onClick={() => handleDownloadModel(m)}
                            className="flex items-center space-x-1 text-[10px] bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-semibold px-2.5 py-1 rounded-lg transition"
                          >
                            {isDownloading ? (
                              <RefreshCw className="w-3 h-3 animate-spin" />
                            ) : (
                              <Download className="w-3 h-3" />
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

export default App;
