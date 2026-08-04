import { motion } from "framer-motion";
import { HistoryEntry } from "../lib/types";
import { getMediaSrc } from "../lib/media";

interface RecentHistoryDrawerProps {
  history: HistoryEntry[];
  onClose: () => void;
  onRestore?: (entry: HistoryEntry) => void;
  isOpen?: boolean;
  onSelectHistoryItem?: (item: any) => void;
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
    if (!timestamp) return "NOW";
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClose}
      className="absolute inset-0 bg-[rgba(6,5,5,.7)] flex items-stretch justify-end z-[100] p-3"
    >
      <motion.div
        initial={{ opacity: 0, x: 30 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 30 }}
        transition={{ duration: 0.3, ease: [0.22, 1.25, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="w-[380px] flex flex-col border border-[var(--border-subtle)] rounded-2xl overflow-hidden bg-[#0D0C0B] shadow-[0_30px_70px_rgba(0,0,0,.6)]"
      >
        {/* Header */}
        <div className="flex-none h-[52px] flex items-center justify-between px-4 border-b border-[var(--border-default)]">
          <div className="flex items-baseline gap-[9px]">
            <span className="text-[13px] font-semibold">Recent jobs</span>
            <span className="font-['Martian_Mono',monospace] text-[9.5px] text-[var(--text-dim)]">
              {String(history.length).padStart(2, "0")}
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-6 h-6 border-none rounded-[7px] bg-transparent text-[var(--text-muted)] text-[15px] cursor-pointer transition-all duration-150 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            ×
          </button>
        </div>

        {/* History list */}
        <div className="flex-1 overflow-y-auto min-h-0 p-2">
          {history.length === 0 ? (
            <div className="p-6 text-center font-['Martian_Mono',monospace] text-[9px] text-[var(--text-ghost)] tracking-[0.06em] leading-[1.9]">
              NO HISTORY YET
            </div>
          ) : (
            history.map((h) => {
              const mediaPath = h.upscaledPath || h.originalPath || h.inputPath || "";
              const src = mediaPath ? getMediaSrc(mediaPath) : "";

              return (
                <div
                  key={h.id}
                  onClick={() => handleSelect(h)}
                  className="flex gap-3 p-[11px] rounded-[11px] cursor-pointer transition-colors duration-150 hover:bg-[var(--bg-elevated)]"
                >
                  {/* Real media thumbnail */}
                  <div className="w-[38px] h-[38px] flex-none border border-[var(--border-default)] rounded-[9px] overflow-hidden bg-[#1B1917] relative">
                    {src && !h.isVideo ? (
                      <img src={src} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center font-['Martian_Mono',monospace] text-[8px] text-[var(--text-muted)]">
                        {h.isVideo ? "VID" : "IMG"}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11.5px] font-medium text-[#EDEAE6] whitespace-nowrap overflow-hidden text-ellipsis mb-[3px]">
                      {h.fileName || h.name || "Upscaled Media"}
                    </div>
                    <div className="font-['Martian_Mono',monospace] text-[9px] text-[var(--text-dim)] tracking-[0.04em]">
                      {h.meta || `${(h.modelName || h.model || 'RealESRGAN').toUpperCase()} · ${h.scale || 4}×`}
                    </div>
                  </div>
                  <div className="font-['Martian_Mono',monospace] text-[9px] text-[#4A453F] flex-none">
                    {h.time || getFormattedTime(h.timestamp)}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

export default RecentHistoryDrawer;
