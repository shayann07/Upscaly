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
    <div className="w-full h-full flex flex-col border border-[#34312D] rounded-[14px] bg-[rgba(13,12,11,.97)] shadow-[0_20px_50px_rgba(0,0,0,.6)] overflow-hidden">
      {/* Header */}
      <div className="flex-none h-[38px] flex items-center justify-between px-3 border-b border-[#232120]">
        <div className="flex items-baseline gap-2">
          <span className="font-['Martian_Mono',monospace] text-[9.5px] tracking-[0.1em] text-[#6B655E]">MODEL CATALOG</span>
          <span className="font-['Martian_Mono',monospace] text-[9px] text-[var(--text-dim)] tracking-[0.06em]">
            ({activeInstalled.length}/{SUPPORTED_MODELS.length})
          </span>
        </div>
        <button
          onClick={onClose}
          className="w-5 h-5 flex items-center justify-center border-none rounded-md bg-transparent text-[#6B655E] text-sm cursor-pointer transition-all duration-150 hover:bg-[#1C1B19] hover:text-[#F2F0ED]"
        >
          ×
        </button>
      </div>

      {/* Model list */}
      <div className="flex-1 overflow-y-auto min-h-0 p-2 space-y-1.5">
        {SUPPORTED_MODELS.map((m: ModelInfo) => {
          const isInstalled = activeInstalled.includes(m.id);
          const isDl = activeDownloading === m.id;
          return (
            <div
              key={m.id}
              className="p-2.5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] transition-all duration-200 hover:scale-[1.02] hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-pill-hover)]"
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[12px] font-semibold text-[var(--text-primary)] truncate">{m.name}</span>
                <span className="font-['Martian_Mono',monospace] text-[8.5px] tracking-[0.05em] px-1.5 py-0.5 rounded border border-[var(--border-default)] text-[var(--text-dim)]">
                  {m.cat.toUpperCase()}
                </span>
              </div>
              <div className="text-[11px] text-[var(--text-muted)] mb-1.5 line-clamp-2">{m.note}</div>
              <div className="flex items-center justify-between gap-2">
                <div className="font-['Martian_Mono',monospace] text-[8.5px] text-[#5A554F] tracking-[0.04em] truncate">
                  {m.size} · {m.scale}×
                </div>

                <div>
                  {isInstalled && !isDl && (
                    <span className="font-['Martian_Mono',monospace] text-[8.5px] tracking-[0.06em] text-[var(--success)] px-2 py-0.5 border border-[var(--success-border)] rounded bg-[var(--success-bg)]">
                      INSTALLED
                    </span>
                  )}
                  {isDl && (
                    <div className="w-[80px]">
                      <div className="font-['Martian_Mono',monospace] text-[8.5px] tracking-[0.04em] mb-1" style={{ color: accentColor }}>
                        {Math.round(activeDlPct)}%
                      </div>
                      <div className="h-[3px] rounded-sm bg-[#1B1917] overflow-hidden">
                        <div className="h-full" style={{ width: `${activeDlPct}%`, background: accentColor }} />
                      </div>
                    </div>
                  )}
                  {!isInstalled && !isDl && (
                    <button
                      onClick={() => onDownloadModel(m.id)}
                      className="h-6 px-2.5 border border-[var(--border-subtle)] rounded-md bg-[var(--bg-base)] text-[#EDEAE6] font-['Archivo',sans-serif] text-[10.5px] font-semibold cursor-pointer transition-all duration-150 hover:bg-[var(--bg-hover)]"
                    >
                      Download
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ModelCatalogModal;
