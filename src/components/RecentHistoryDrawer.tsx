import { HistoryEntry } from '../lib/types';
import { getMediaSrc } from '../lib/media';

interface RecentHistoryDrawerProps {
  history: HistoryEntry[];
  onClose: () => void;
  onRestore?: (entry: HistoryEntry) => void;
  isOpen?: boolean;
  onSelectHistoryItem?: (item: HistoryEntry) => void;
  onClearHistory?: () => void;
  onRemoveItem?: (id: string) => void;
}

export function RecentHistoryDrawer({
  history = [],
  onClose,
  onRestore,
  isOpen = true,
  onSelectHistoryItem,
}: RecentHistoryDrawerProps) {
  if (isOpen === false) return null;

  const handleSelect = (item: HistoryEntry) => {
    if (onRestore) onRestore(item);
    if (onSelectHistoryItem) onSelectHistoryItem(item);
  };

  const getFormattedTime = (timestamp?: number) => {
    if (!timestamp) return 'NOW';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="w-full h-full flex flex-col border border-[#34312D] rounded-[14px] bg-[rgba(13,12,11,.97)] shadow-[0_20px_50px_rgba(0,0,0,.6)] overflow-hidden">
      {/* Header */}
      <div className="flex-none h-[38px] flex items-center justify-between px-3 border-b border-[#232120]">
        <div className="flex items-baseline gap-2">
          <span className="font-['Martian_Mono',monospace] text-[9.5px] tracking-[0.1em] text-[#6B655E]">
            RECENT JOBS
          </span>
          <span className="font-['Martian_Mono',monospace] text-[9px] text-[var(--text-dim)]">
            ({String(history.length).padStart(2, '0')})
          </span>
        </div>
        <button
          onClick={onClose}
          className="w-5 h-5 flex items-center justify-center border-none rounded-md bg-transparent text-[#6B655E] text-sm cursor-pointer transition-all duration-150 hover:bg-[#1C1B19] hover:text-[#F2F0ED]"
        >
          ×
        </button>
      </div>

      {/* History list */}
      <div className="flex-1 overflow-y-auto min-h-0 p-2 space-y-1">
        {history.length === 0 ? (
          <div className="p-6 text-center font-['Martian_Mono',monospace] text-[9px] text-[var(--text-ghost)] tracking-[0.06em] leading-[1.9]">
            NO HISTORY YET
          </div>
        ) : (
          history.map((h) => {
            const mediaPath = h.upscaledPath || h.originalPath || h.inputPath || '';
            const src = mediaPath ? getMediaSrc(mediaPath) : '';

            return (
              <div
                key={h.id}
                onClick={() => handleSelect(h)}
                className="flex items-center gap-2.5 p-2 rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] cursor-pointer transition-all duration-200 hover:scale-[1.02] hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-pill-hover)]"
              >
                {/* Real media thumbnail */}
                <div className="w-[32px] h-[32px] flex-none border border-[var(--border-default)] rounded-lg overflow-hidden bg-[#1B1917] relative">
                  {src && !h.isVideo ? (
                    <img src={src} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center font-['Martian_Mono',monospace] text-[8px] text-[var(--text-muted)]">
                      {h.isVideo ? 'VID' : 'IMG'}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-medium text-[#EDEAE6] whitespace-nowrap overflow-hidden text-ellipsis mb-0.5">
                    {h.fileName || h.name || 'Upscaled Media'}
                  </div>
                  <div className="font-['Martian_Mono',monospace] text-[8.5px] text-[var(--text-dim)] tracking-[0.04em]">
                    {h.meta ||
                      `${(h.modelName || h.model || 'RealESRGAN').toUpperCase()} · ${h.scale || 4}×`}
                  </div>
                </div>
                <div className="font-['Martian_Mono',monospace] text-[8px] text-[#4A453F] flex-none">
                  {h.time || getFormattedTime(h.timestamp)}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default RecentHistoryDrawer;
