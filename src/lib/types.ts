export interface GpuInfo {
  id: number;
  name: string;
  detail: string;
  fp16_storage_supported?: boolean;
  fp16_arithmetic_supported?: boolean;
  compute_queue_count?: number;
}


export interface ModelInfo {
  id: string;
  name: string;
  note: string;
  cat: "photo" | "anime" | "video";
  scale: number;
  size: string;
  speed: number;
  version?: string;
  installed?: boolean;
  hasUpdate?: boolean;
  isCorrupt?: boolean;
  isCustom?: boolean;
}

export interface HistoryEntry {
  id: string;
  name?: string;
  meta?: string;
  time?: string;
  inputPath?: string;
  outputPath?: string;
  w?: number;
  h?: number;
  scale?: number;
  model?: string;
  fileName?: string;
  originalPath?: string;
  upscaledPath?: string;
  modelName?: string;
  isVideo?: boolean;
  timestamp?: number;
}

export interface Toast {
  id: string;
  kind?: string;
  text?: string;
  type?: "success" | "error" | "info" | "warning";
  message?: string;
}

export interface BatchItem {
  id: string;
  path?: string;
  name?: string;
  w?: number;
  h?: number;
  status: "ready" | "queued" | "processing" | "done" | "error" | "completed" | "failed" | "cancelled" | "idle";
  progress: number;
  scale?: number;
  model?: string;
  outputPath?: string;
  filePath?: string;
  fileName?: string;
  fileSize?: number;
  isVideo?: boolean;
  upscaledPath?: string;
  statusMessage?: string;
  error?: string;
}

export const SUPPORTED_MODELS: ModelInfo[] = [
  {
    id: "realesrgan-x4plus",
    name: "RealESRGAN Ultra",
    note: "Highest detail on photographs, portraits and landscapes",
    cat: "photo",
    scale: 4,
    size: "67.0 MB",
    speed: 1.0,
  },
  {
    id: "realesrgan-x4plus-anime",
    name: "Anime Art",
    note: "Line work, flats and cel shading in illustration and manga",
    cat: "anime",
    scale: 4,
    size: "17.9 MB",
    speed: 1.5,
  },
  {
    id: "realesr-animevideov3-x2",
    name: "Anime Video 2×",
    note: "Frame sequences at low latency",
    cat: "video",
    scale: 2,
    size: "2.4 MB",
    speed: 3.3,
  },
  {
    id: "realesr-animevideov3-x3",
    name: "Anime Video 3×",
    note: "Frame sequences, balanced quality and throughput",
    cat: "video",
    scale: 3,
    size: "2.4 MB",
    speed: 2.4,
  },
  {
    id: "realesr-animevideov3-x4",
    name: "Anime Video 4×",
    note: "Frame sequences at maximum reconstruction detail",
    cat: "video",
    scale: 4,
    size: "2.4 MB",
    speed: 1.8,
  },
];

export const SUPPORTED_SCALES = [2, 3, 4];

export interface JobProgress {
  job_id: string;
  percentage: number;
  status: string;
  error?: string;
  phase?: string;
  eta_seconds?: number;
  fps?: number;
  output_path?: string;
}

export type JobState = "ready" | "queued" | "running" | "succeeded" | "failed" | "cancelled";

export function isTerminalState(state: JobState | string): boolean {
  return state === "succeeded" || state === "failed" || state === "cancelled";
}

export function isValidStateTransition(from: JobState, to: JobState): boolean {
  if (from === to) return true;
  if (isTerminalState(from)) return false; // terminal states cannot return to active
  if (from === "ready") return to === "queued" || to === "running" || to === "cancelled";
  if (from === "queued") return to === "running" || to === "cancelled" || to === "failed";
  if (from === "running") return to === "succeeded" || to === "failed" || to === "cancelled";
  return false;
}


