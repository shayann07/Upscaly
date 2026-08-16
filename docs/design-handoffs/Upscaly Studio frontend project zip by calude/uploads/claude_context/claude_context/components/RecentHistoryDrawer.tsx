import React from 'react';
import { HistoryItem } from '../lib/history';
import { getMediaSrc } from '../lib/media';
import { X, Trash, Clock, ArrowSquareOut, Sparkle, FolderOpen, Video as VideoIcon } from '@phosphor-icons/react';
import { invoke } from '@tauri-apps/api/core';

interface RecentHistoryDrawerProps {
  history: HistoryItem[];
  isOpen: boolean;
  onClose: () => void;
  onSelectHistoryItem: (item: HistoryItem) => void;
  onClearHistory: () => void;
  onRemoveItem?: (id: string) => void;
}

export const RecentHistoryDrawer: React.FC<RecentHistoryDrawerProps> = ({
  history,
  isOpen,
  onClose,
  onSelectHistoryItem,
  onClearHistory,
  onRemoveItem,
}) => {
  if (!isOpen) return null;

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleReveal = async (e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    try {
      await invoke('show_in_explorer_native', { path });
    } catch (err) {
      console.error('Failed to reveal file:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm select-none">
      <div className="w-96 h-full bg-[#141419] border-l border-[#272730] shadow-2xl flex flex-col">
        {/* Drawer Header */}
        <div className="h-12 px-4 border-b border-[#272730] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-indigo-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-white">
              Recent Upscales
            </h3>
            <span className="px-2 py-0.5 rounded-full bg-[#181820] text-[10px] font-mono text-zinc-400 border border-[#272730]">
              {history.length}
            </span>
          </div>

          <div className="flex items-center gap-1">
            {history.length > 0 && (
              <button
                type="button"
                onClick={onClearHistory}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-950/30 transition-colors"
                title="Clear All History"
              >
                <Trash size={14} />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-[#181820] transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Drawer Content */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {history.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-2 text-center text-zinc-500 p-6">
              <Clock size={36} className="text-zinc-600" />
              <p className="text-xs font-medium text-zinc-400">No Recent Upscales Yet</p>
              <p className="text-[11px] text-zinc-500">
                Completed upscales will automatically appear here for quick review and comparison.
              </p>
            </div>
          ) : (
            history.map((item) => (
              <div
                key={item.id}
                onClick={() => onSelectHistoryItem(item)}
                className="group relative rounded-xl bg-[#181820] hover:bg-[#22222B] border border-[#272730] hover:border-indigo-500/40 p-3 transition-all cursor-pointer shadow-md space-y-2"
              >
                <div className="flex items-start gap-3">
                  {/* Thumbnail Preview */}
                  <div className="w-12 h-12 rounded-lg bg-[#0F0F12] border border-[#272730] overflow-hidden shrink-0 flex items-center justify-center relative">
                    {item.isVideo ? (
                      <VideoIcon size={20} className="text-emerald-400" />
                    ) : (
                      <img
                        src={getMediaSrc(item.upscaledPath)}
                        alt={item.fileName}
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>

                  {/* File Info */}
                  <div className="flex-1 min-w-0 pr-6">
                    <p className="text-xs font-semibold text-white truncate">{item.fileName}</p>
                    <div className="flex items-center gap-1.5 mt-1 font-mono text-[10px] text-zinc-400">
                      <span className="px-1.5 py-0.5 rounded bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-0.5">
                        <Sparkle size={9} weight="fill" />
                        {item.scale}x
                      </span>
                      <span className="truncate">{item.modelName}</span>
                    </div>
                  </div>

                  {/* Quick Remove Item Button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onRemoveItem) onRemoveItem(item.id);
                    }}
                    className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 p-1 rounded text-zinc-500 hover:text-red-400 transition-opacity"
                    title="Remove item"
                  >
                    <X size={12} />
                  </button>
                </div>

                {/* Actions Footer */}
                <div className="flex items-center justify-between pt-1 text-[10px] text-zinc-500 border-t border-[#272730]/60">
                  <span>{formatDate(item.timestamp)}</span>
                  <div className="flex items-center gap-2 text-indigo-400 font-medium">
                    <button
                      type="button"
                      onClick={(e) => handleReveal(e, item.upscaledPath)}
                      className="hover:underline flex items-center gap-1"
                    >
                      <FolderOpen size={11} />
                      <span>Explorer</span>
                    </button>
                    <span className="text-zinc-600">&bull;</span>
                    <span className="hover:underline flex items-center gap-1">
                      <ArrowSquareOut size={11} />
                      <span>Load in Studio</span>
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
