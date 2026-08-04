import { motion } from "framer-motion";
import { SUPPORTED_MODELS, ModelInfo } from "../lib/types";

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
  onClose: () => void;
  accentColor?: string;
  isOpen?: boolean;
  cloudModels?: ModelItem[];
  installedModelIds?: string[];
  onDownloadModel?: (modelId: string) => void;
  downloadingModelId?: string | null;
  downloadProgress?: number;
}

export function ModelCatalogModal({
  onClose,
  accentColor = "var(--accent)",
  isOpen = true,
  installedModelIds = [],
  onDownloadModel = () => {},
  downloadingModelId = null,
  downloadProgress = 0,
}: ModelCatalogModalProps) {
  if (isOpen === false) return null;

  const activeInstalled = installedModelIds;
  const activeDownloading = downloadingModelId;
  const activeDlPct = downloadProgress;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClose}
      className="absolute inset-0 bg-[var(--bg-overlay)] flex items-center justify-center z-[100] p-10"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.955 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.955 }}
        transition={{ duration: 0.28, ease: [0.22, 1.3, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[620px] max-h-[80vh] flex flex-col border border-[var(--border-subtle)] rounded-2xl overflow-hidden bg-[var(--bg-surface)] shadow-[var(--shadow-modal)]"
      >
        {/* Header */}
        <div className="flex-none h-[52px] flex items-center justify-between px-[18px] border-b border-[var(--border-default)]">
          <div className="flex items-baseline gap-2.5">
            <span className="text-[13.5px] font-semibold">Model catalog</span>
            <span className="font-['Martian_Mono',monospace] text-[9.5px] text-[var(--text-dim)] tracking-[0.06em]">
              {activeInstalled.length} OF {SUPPORTED_MODELS.length} INSTALLED
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-6 h-6 border-none rounded-[7px] bg-transparent text-[var(--text-muted)] text-[15px] cursor-pointer transition-all duration-150 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            ×
          </button>
        </div>

        {/* Model list */}
        <div className="flex-1 overflow-y-auto min-h-0 p-2">
          {SUPPORTED_MODELS.map((m: ModelInfo) => {
            const isInstalled = activeInstalled.includes(m.id);
            const isDl = activeDownloading === m.id;
            return (
              <div
                key={m.id}
                className="flex items-center gap-3.5 p-3 rounded-[11px] transition-colors duration-150 hover:bg-[var(--bg-elevated)]"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-[3px]">
                    <span className="text-[12.5px] font-semibold text-[var(--text-primary)]">{m.name}</span>
                    <span className="font-['Martian_Mono',monospace] text-[9px] tracking-[0.05em] px-1.5 py-[3px] rounded-[6px] border border-[var(--border-default)] text-[var(--text-dim)]">
                      {m.cat.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-[11.5px] text-[var(--text-muted)] mb-[3px]">{m.note}</div>
                  <div className="font-['Martian_Mono',monospace] text-[9px] text-[#4A453F] tracking-[0.04em]">
                    {m.id.toUpperCase()} · {m.size} · {m.scale}× NATIVE
                  </div>
                </div>

                <div className="flex-none">
                  {isInstalled && !isDl && (
                    <span className="font-['Martian_Mono',monospace] text-[9px] tracking-[0.06em] text-[var(--success)] px-2.5 py-1.5 border border-[var(--success-border)] rounded-[7px] bg-[var(--success-bg)]">
                      INSTALLED
                    </span>
                  )}
                  {isDl && (
                    <div className="w-[100px]">
                      <div className="font-['Martian_Mono',monospace] text-[9px] tracking-[0.04em] mb-[5px]" style={{ color: accentColor }}>
                        FETCHING {Math.round(activeDlPct)}%
                      </div>
                      <div className="h-[3px] rounded-sm bg-[#1B1917] overflow-hidden">
                        <div className="h-full" style={{ width: `${activeDlPct}%`, background: accentColor }} />
                      </div>
                    </div>
                  )}
                  {!isInstalled && !isDl && (
                    <button
                      onClick={() => onDownloadModel(m.id)}
                      className="h-7 px-3 border border-[var(--border-subtle)] rounded-lg bg-[var(--bg-elevated)] text-[#EDEAE6] font-['Archivo',sans-serif] text-[11.5px] font-semibold cursor-pointer transition-all duration-150 hover:bg-[var(--bg-hover)]"
                    >
                      Download
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>
    </motion.div>
  );
}

export default ModelCatalogModal;
