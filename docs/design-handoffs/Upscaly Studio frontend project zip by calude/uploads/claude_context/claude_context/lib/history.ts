export interface HistoryItem {
  id: string;
  fileName: string;
  originalPath: string;
  upscaledPath: string;
  modelName: string;
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
