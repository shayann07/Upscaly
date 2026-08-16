import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, DownloadSimple, CheckCircle, Spinner, Cpu, Sparkle } from '@phosphor-icons/react';

export interface ModelItem {
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

interface ModelCatalogModalProps {
  isOpen: boolean;
  onClose: () => void;
  cloudModels: ModelItem[];
  installedModelIds: string[];
  onDownloadModel: (modelId: string) => void;
  downloadingModelId: string | null;
  downloadProgress: number;
}

export const ModelCatalogModal: React.FC<ModelCatalogModalProps> = ({
  isOpen,
  onClose,
  cloudModels,
  installedModelIds,
  onDownloadModel,
  downloadingModelId,
  downloadProgress,
}) => {
  if (!isOpen) return null;

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-6 select-none">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="w-full max-w-2xl bg-[#141419] border border-[#272730] rounded-2xl p-6 shadow-2xl space-y-5 relative overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[#272730] pb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/40 text-indigo-400 flex items-center justify-center">
                <Sparkle size={20} weight="fill" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white tracking-wide">
                  Model Weights Catalog
                </h2>
                <p className="text-xs text-zinc-400">
                  Download NCNN Vulkan model binaries for local GPU inference
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-zinc-500 hover:text-white p-1 rounded-lg hover:bg-[#181820] transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          {/* Models List */}
          <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
            {cloudModels.map((m) => {
              const isInstalled = installedModelIds.includes(m.id);
              const isDownloading = downloadingModelId === m.id;
              const totalSize = m.param_size + m.bin_size;

              return (
                <div
                  key={m.id}
                  className="p-3.5 rounded-xl bg-[#181820] border border-[#272730] flex items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Cpu size={16} className="text-indigo-400" />
                      <h3 className="text-xs font-bold text-white">{m.name}</h3>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-600/20 text-indigo-300 border border-indigo-500/30">
                        {m.version}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400 font-mono">
                      Size: {formatSize(totalSize)}
                    </p>
                  </div>

                  <div>
                    {isInstalled ? (
                      <span className="flex items-center gap-1 text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 rounded-lg">
                        <CheckCircle size={14} weight="fill" />
                        Installed
                      </span>
                    ) : isDownloading ? (
                      <div className="flex items-center gap-2 bg-indigo-600/20 border border-indigo-500/40 px-3 py-1.5 rounded-lg text-xs font-mono text-indigo-300">
                        <Spinner size={14} className="animate-spin text-indigo-400" />
                        <span>{downloadProgress.toFixed(0)}%</span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onDownloadModel(m.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow transition-colors cursor-pointer"
                      >
                        <DownloadSimple size={14} weight="bold" />
                        <span>Download</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
