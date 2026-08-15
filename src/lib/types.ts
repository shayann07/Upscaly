import { JobState } from './jobState';

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
  cat: 'photo' | 'anime' | 'video';
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
  /** Stable model identifier -- see HistoryItem.modelId. */
  modelId?: string;
  /** Display name on entries written before modelId existed. */
  modelName?: string;
  isVideo?: boolean;
  timestamp?: number;
}

export interface Toast {
  id: string;
  kind?: string;
  text?: string;
  type?: 'success' | 'error' | 'info' | 'warning';
  message?: string;
}

/**
 * IPC payloads are generated from the Rust definitions rather than restated
 * here -- see src/lib/ipc. Re-exported so existing imports from this module
 * keep working, but the shapes themselves now have exactly one author.
 */
export type {
  AppErrorPayload,
  AppSettings,
  FullModelInfo,
  GpuDevice,
  JobSnapshot,
  JobsDelta,
  QualityPreset,
  UpscaleJobHandle,
  UpscaleRequest,
  VramProfile,
} from './ipc';

/**
 * How many toasts can be on screen at once. Shared by the toast store
 * (useStudioState) and the renderer (ToastContainer) so the two can never
 * disagree: when the store was allowed to grow past what renders, an
 * off-screen toast still matched the dedupe check and silently suppressed
 * an identical notification the user would otherwise have seen.
 */
export const MAX_VISIBLE_TOASTS = 3;

export interface BatchItem {
  id: string;
  path?: string;
  name?: string;
  w?: number;
  h?: number;
  /**
   * Canonical lifecycle state. There used to be two overlapping vocabularies
   * -- `processing`/`done`/`error`/`idle` in the UI and
   * `running`/`succeeded`/`failed`/`ready` from the backend -- which meant
   * every comparison had to test for both spellings and any missed one read
   * as "not that state". `normalizeJobStatus` maps incoming strings once, at
   * the event boundary; everything downstream uses only these.
   */
  status: JobState;
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
    id: 'realesrgan-x4plus',
    name: 'RealESRGAN Ultra',
    note: 'Highest detail on photographs, portraits and landscapes',
    cat: 'photo',
    scale: 4,
    size: '67.0 MB',
    speed: 1.0,
  },
  {
    id: 'realesrgan-x4plus-anime',
    name: 'Anime Art',
    note: 'Line work, flats and cel shading in illustration and manga',
    cat: 'anime',
    scale: 4,
    size: '17.9 MB',
    speed: 1.5,
  },
  {
    id: 'realesr-animevideov3-x2',
    name: 'Anime Video 2×',
    note: 'Frame sequences at low latency',
    cat: 'video',
    scale: 2,
    size: '2.4 MB',
    speed: 3.3,
  },
  {
    id: 'realesr-animevideov3-x3',
    name: 'Anime Video 3×',
    note: 'Frame sequences, balanced quality and throughput',
    cat: 'video',
    scale: 3,
    size: '2.4 MB',
    speed: 2.4,
  },
  {
    id: 'realesr-animevideov3-x4',
    name: 'Anime Video 4×',
    note: 'Frame sequences at maximum reconstruction detail',
    cat: 'video',
    scale: 4,
    size: '2.4 MB',
    speed: 1.8,
  },
];

export const SUPPORTED_SCALES = [2, 3, 4];

export type { JobState } from './jobState';
export { isTerminalState, isValidStateTransition, normalizeJobStatus } from './jobState';
