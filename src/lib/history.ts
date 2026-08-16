export interface HistoryItem {
  id: string;
  fileName: string;
  originalPath: string;
  upscaledPath: string;
  /**
   * Stable model identifier, e.g. `realesrgan-x4plus`. Display names are
   * resolved from the live catalog at render time rather than frozen here:
   * entries used to store the display name, which meant restoring one had to
   * match catalogs by name and silently failed whenever the stored string
   * disagreed with the current catalog's wording.
   */
  modelId: string;
  /** Display name from older entries, kept only so they still render. */
  modelName?: string;
  scale: number;
  isVideo: boolean;
  timestamp: number;
}

const HISTORY_KEY = 'upscaly_recent_history';

export function getRecentHistory(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as HistoryItem[];
  } catch (err) {
    console.error('Failed to load history:', err);
    return [];
  }
}

export function addHistoryItem(item: Omit<HistoryItem, 'id' | 'timestamp'>): HistoryItem[] {
  try {
    const current = getRecentHistory();
    const newItem: HistoryItem = {
      ...item,
      id: Math.random().toString(36).substring(7),
      timestamp: Date.now(),
    };
    // Deduplicate by upscaledPath if already exists
    const filtered = current.filter((h) => h.upscaledPath !== item.upscaledPath);
    const updated = [newItem, ...filtered].slice(0, 20); // Keep top 20
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.error('Failed to save history item:', err);
    return getRecentHistory();
  }
}

/**
 * Folds the backend's durable history into the local copy.
 *
 * The backend records completions at the transition itself, so it has
 * entries for jobs that finished while no webview was watching -- the exact
 * entries localStorage is missing. Local entries are kept too, because they
 * predate the backend file. Deduplicated on the output path: the same file
 * cannot be two different completions.
 */
export function mergeBackendHistory(
  records: {
    file_name: string;
    input_path: string;
    output_path: string;
    model_name: string;
    scale: number;
    is_video: boolean;
    timestamp_ms: number;
  }[]
): HistoryItem[] {
  try {
    const local = getRecentHistory();
    const seen = new Set(local.map((h) => h.upscaledPath));
    const fromBackend: HistoryItem[] = records
      .filter((r) => !seen.has(r.output_path))
      .map((r) => ({
        id: `bk-${r.timestamp_ms}-${r.output_path.length}`,
        fileName: r.file_name,
        originalPath: r.input_path,
        upscaledPath: r.output_path,
        modelId: r.model_name,
        scale: r.scale,
        isVideo: r.is_video,
        timestamp: r.timestamp_ms,
      }));
    const merged = [...local, ...fromBackend]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 20);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(merged));
    return merged;
  } catch (err) {
    console.error('Failed to merge backend history:', err);
    return getRecentHistory();
  }
}

export function removeHistoryItem(id: string): HistoryItem[] {
  try {
    const current = getRecentHistory();
    const updated = current.filter((h) => h.id !== id);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.error('Failed to remove history item:', err);
    return getRecentHistory();
  }
}

export function clearHistory(): HistoryItem[] {
  try {
    localStorage.removeItem(HISTORY_KEY);
    return [];
  } catch (err) {
    console.error('Failed to clear history:', err);
    return [];
  }
}
