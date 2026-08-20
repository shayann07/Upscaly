import { useEffect, useState } from 'react';
import { HistoryEntry, ModelInfo } from '../lib/types';
import { getThumbnail } from '../lib/thumbnailCache';
import { usePanelA11y } from '../hooks/usePanelA11y';

interface RecentHistoryDrawerProps {
  history: HistoryEntry[];
  /** Live catalog, used to turn a stored model id into a readable name. */
  supportedModels?: ModelInfo[];
  onClose: () => void;
  onRestore?: (entry: HistoryEntry) => void;
  isOpen?: boolean;
  onSelectHistoryItem?: (item: HistoryEntry) => void;
  onClearHistory?: () => void;
  onRemoveItem?: (id: string) => void;
}

function HistoryThumbnail({
  mediaPath,
  isVideo,
}: {
  mediaPath: string;
  isVideo?: boolean;
}) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setLoadFailed(false);
    if (!mediaPath) {
      setThumbUrl(null);
      return;
    }

    getThumbnail(mediaPath, isVideo).then((url) => {
      if (active) {
        setThumbUrl(url);
      }
    });

    return () => {
      active = false;
    };
  }, [mediaPath, isVideo]);

  return (
    <div className="w-[32px] h-[32px] flex-none border border-[var(--border-default)] rounded-lg overflow-hidden bg-[#1B1917] relative flex items-center justify-center">
      {thumbUrl && !loadFailed ? (
        isVideo && !thumbUrl.startsWith('data:') && !thumbUrl.startsWith('blob:') ? (
          <video
            src={`${thumbUrl}#t=0.001`}
            preload="metadata"
            muted
            playsInline
            onError={() => setLoadFailed(true)}
            className="w-full h-full object-cover pointer-events-none"
          />
        ) : (
          <img
            src={thumbUrl}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setLoadFailed(true)}
            className="w-full h-full object-cover pointer-events-none"
          />
        )
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-[#151413] text-[#5A544C]">
          {isVideo ? (
            <svg className="w-3.5 h-3.5 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          )}
        </div>
      )}
    </div>
  );
}

export function RecentHistoryDrawer({
  history = [],
  supportedModels = [],
  onClose,
  onRestore,
  isOpen = true,
  onSelectHistoryItem,
}: RecentHistoryDrawerProps) {
  // Above the early return: hook order must not depend on isOpen.
  const panelRef = usePanelA11y<HTMLDivElement>(isOpen);

  // Entries store the model id; the readable name comes from the live
  // catalog so a renamed model reads correctly in history too. Older entries
  // predate the id and carry only a name, so fall back to that.
  const resolveModelLabel = (entry: HistoryEntry): string => {
    const fromCatalog = entry.modelId
      ? supportedModels.find((m) => m.id === entry.modelId)?.name
      : undefined;
    return fromCatalog || entry.modelName || entry.modelId || entry.model || 'RealESRGAN';
  };

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
    <div
      ref={panelRef}
      role="dialog"
      aria-labelledby="history-panel-title"
      tabIndex={-1}
      className="w-full h-full flex flex-col border border-[#34312D] rounded-[14px] bg-[rgba(13,12,11,.97)] shadow-[0_20px_50px_rgba(0,0,0,.6)] overflow-hidden outline-none"
    >
      {/* Header */}
      <div className="flex-none h-[38px] flex items-center justify-between px-3 border-b border-[#232120]">
        <div className="flex items-baseline gap-2">
          <span
            id="history-panel-title"
            className="font-['Martian_Mono',monospace] text-[9.5px] tracking-[0.1em] text-[#6B655E]"
          >
            RECENT JOBS
          </span>
          <span className="font-['Martian_Mono',monospace] text-[9px] text-[var(--text-dim)]">
            ({String(history.length).padStart(2, '0')})
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close recent jobs"
          className="w-5 h-5 flex items-center justify-center border-none rounded-md bg-transparent text-[#6B655E] text-sm cursor-pointer transition-all duration-150 hover:bg-[#1C1B19] hover:text-[#F2F0ED] focus-visible:ring-1 focus-visible:ring-[var(--border-hover)]"
        >
          <span aria-hidden="true">×</span>
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

            return (
              <div
                key={h.id}
                onClick={() => handleSelect(h)}
                className="flex items-center gap-2.5 p-2 rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] cursor-pointer transition-all duration-200 hover:scale-[1.02] hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-pill-hover)]"
              >
                {/* Real media thumbnail */}
                <HistoryThumbnail
                  mediaPath={mediaPath}
                  isVideo={h.isVideo}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-medium text-[#EDEAE6] whitespace-nowrap overflow-hidden text-ellipsis mb-0.5">
                    {h.fileName || h.name || 'Upscaled Media'}
                  </div>
                  <div className="font-['Martian_Mono',monospace] text-[8.5px] text-[var(--text-dim)] tracking-[0.04em]">
                    {h.meta || `${resolveModelLabel(h).toUpperCase()} · ${h.scale || 4}×`}
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
