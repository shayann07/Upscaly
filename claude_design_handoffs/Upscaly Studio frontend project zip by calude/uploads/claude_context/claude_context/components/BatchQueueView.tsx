import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Video as VideoIcon,
  Trash,
  CheckCircle,
  XCircle,
  Spinner,
  Plus,
  ArrowSquareOut,
  FolderOpen,
  Broom,
  Sparkle,
} from '@phosphor-icons/react';
import { getMediaSrc } from '../lib/media';

export interface BatchItem {
  id: string;
  filePath: string;
  fileName: string;
  fileSize: number;
  isVideo: boolean;
  status: 'idle' | 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  statusMessage?: string;
  upscaledPath?: string;
  error?: string;
}

interface BatchQueueViewProps {
  items: BatchItem[];
  onRemoveItem: (id: string) => void;
  onClearCompleted: () => void;
  onAddMoreFiles: () => void;
  onOpenFileNative: (path: string) => void;
  onShowInExplorerNative: (path: string) => void;
  onCancelItem: (id: string) => void;
}

export const BatchQueueView: React.FC<BatchQueueViewProps> = ({
  items,
  onRemoveItem,
  onClearCompleted,
  onAddMoreFiles,
  onOpenFileNative,
  onShowInExplorerNative,
  onCancelItem,
}) => {
  const completedCount = items.filter((i) => i.status === 'completed').length;
  const processingCount = items.filter((i) => i.status === 'processing' || i.status === 'queued').length;
  const overallProgress =
    items.length > 0
      ? Math.round(
          items.reduce((acc, item) => {
            if (item.status === 'completed') return acc + 100;
            if (item.status === 'processing') return acc + item.progress;
            return acc;
          }, 0) / items.length
        )
      : 0;

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
  };

  return (
    <div className="w-full h-full flex flex-col gap-3 min-h-0 select-none">
      {/* Batch Header Bar */}
      <div className="flex items-center justify-between bg-[#141419] border border-[#272730] rounded-xl px-4 py-2.5 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/40 text-indigo-400 flex items-center justify-center font-bold">
            <Sparkle size={16} weight="fill" />
          </div>
          <div>
            <h2 className="text-xs font-bold text-white tracking-wide">
              Batch Queue ({items.length} Files)
            </h2>
            <p className="text-[11px] text-zinc-400 font-mono">
              {completedCount} Completed • {processingCount} Processing
            </p>
          </div>
        </div>

        {/* Global Progress Gauge */}
        <div className="flex items-center gap-4">
          <div className="w-48 bg-[#181820] border border-[#272730] rounded-full h-2 overflow-hidden p-0.5 relative">
            <motion.div
              className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${overallProgress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
          <span className="text-xs font-bold font-mono text-indigo-300 w-10 text-right">
            {overallProgress}%
          </span>

          <div className="h-5 w-[1px] bg-[#272730]" />

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onAddMoreFiles}
              className="px-3 py-1.5 rounded-lg bg-[#181820] text-zinc-300 border border-[#272730] hover:bg-[#22222B] hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus size={14} weight="bold" />
              <span>Add Files</span>
            </button>

            {completedCount > 0 && (
              <button
                type="button"
                onClick={onClearCompleted}
                className="px-3 py-1.5 rounded-lg bg-[#181820] text-zinc-400 border border-[#272730] hover:bg-[#22222B] hover:text-zinc-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Clear finished items from list"
              >
                <Broom size={14} />
                <span>Clear Done</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Batch Grid List */}
      <div className="flex-1 overflow-y-auto p-1 grid grid-cols-1 md:grid-cols-2 gap-3 min-h-0">
        <AnimatePresence>
          {items.map((item) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="bg-[#141419] border border-[#272730] rounded-xl p-3 flex gap-3 shadow-lg hover:border-[#3b3b48] transition-colors relative overflow-hidden group"
            >
              {/* Media Thumbnail */}
              <div className="w-16 h-16 rounded-lg bg-[#0F0F12] border border-[#272730] shrink-0 overflow-hidden flex items-center justify-center relative">
                {item.isVideo ? (
                  <video
                    src={getMediaSrc(item.filePath)}
                    className="w-full h-full object-cover"
                    muted
                  />
                ) : (
                  <img
                    src={getMediaSrc(item.filePath)}
                    alt={item.fileName}
                    className="w-full h-full object-cover"
                  />
                )}
                {item.isVideo && (
                  <div className="absolute bottom-1 right-1 p-0.5 rounded bg-black/60 text-white">
                    <VideoIcon size={10} />
                  </div>
                )}
              </div>

              {/* Item Info & Telemetry */}
              <div className="flex-1 min-w-0 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-semibold text-white truncate" title={item.fileName}>
                      {item.fileName}
                    </h3>
                    <button
                      type="button"
                      onClick={() => onRemoveItem(item.id)}
                      className="text-zinc-500 hover:text-rose-400 transition-colors p-1 cursor-pointer"
                      title="Remove from batch"
                    >
                      <Trash size={14} />
                    </button>
                  </div>
                  <p className="text-[10px] text-zinc-400 font-mono">
                    {formatSize(item.fileSize)}
                  </p>
                </div>

                {/* Status Telemetry */}
                <div className="mt-2 space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    {item.status === 'idle' && (
                      <span className="text-zinc-400 font-sans">Ready in Queue</span>
                    )}
                    {item.status === 'queued' && (
                      <span className="text-amber-400 flex items-center gap-1">
                        <Spinner size={12} className="animate-spin" />
                        Queued...
                      </span>
                    )}
                    {item.status === 'processing' && (
                      <span className="text-indigo-400 flex items-center gap-1 font-bold">
                        <Spinner size={12} className="animate-spin" />
                        {item.progress.toFixed(1)}%
                      </span>
                    )}
                    {item.status === 'completed' && (
                      <span className="text-emerald-400 flex items-center gap-1 font-bold">
                        <CheckCircle size={13} weight="fill" />
                        Upscaled
                      </span>
                    )}
                    {item.status === 'failed' && (
                      <span className="text-rose-400 flex items-center gap-1 font-bold truncate max-w-[180px]">
                        <XCircle size={13} weight="fill" />
                        {item.error || 'Failed'}
                      </span>
                    )}

                    {(item.status === 'processing' || item.status === 'queued') && (
                      <button
                        type="button"
                        onClick={() => onCancelItem(item.id)}
                        className="px-2 py-0.5 rounded bg-rose-600/20 text-rose-300 border border-rose-500/30 hover:bg-rose-600 hover:text-white text-[10px] font-sans font-medium transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                    )}

                    {/* Completion Action Buttons */}
                    {item.status === 'completed' && item.upscaledPath && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onOpenFileNative(item.upscaledPath!)}
                          className="px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-sans font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <ArrowSquareOut size={11} />
                          <span>Open</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onShowInExplorerNative(item.upscaledPath!)}
                          className="px-2 py-0.5 rounded bg-[#181820] text-zinc-300 border border-[#272730] hover:bg-[#22222B] text-[10px] font-sans font-medium flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <FolderOpen size={11} />
                          <span>Explorer</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Progress Bar */}
                  {(item.status === 'processing' || item.status === 'queued') && (
                    <div className="w-full bg-[#181820] h-1.5 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-indigo-500 rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${item.progress}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};
