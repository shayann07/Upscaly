import { SUPPORTED_MODELS, ModelInfo } from '../lib/types';
import { usePanelA11y } from '../hooks/usePanelA11y';

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
  supportedModels?: ModelInfo[];
  installedModelIds?: string[];
  onDownloadModel?: (modelId: string) => void;
  /** Percentage per model id currently downloading -- see studioStore. */
  downloadingModels?: Record<string, number>;
}

export function ModelCatalogModal({
  onClose,
  accentColor = 'var(--accent)',
  isOpen = true,
  supportedModels,
  installedModelIds = [],
  onDownloadModel = () => {},
  downloadingModels = {},
}: ModelCatalogModalProps) {
  // Above the early return: hook order must not depend on isOpen.
  const panelRef = usePanelA11y<HTMLDivElement>(isOpen);

  if (isOpen === false) return null;

  const modelsList =
    supportedModels && supportedModels.length > 0 ? supportedModels : SUPPORTED_MODELS;
  const activeInstalled = installedModelIds;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-labelledby="model-catalog-panel-title"
      tabIndex={-1}
      className="w-full h-full flex flex-col border border-[#34312D] rounded-[14px] bg-[rgba(13,12,11,.97)] shadow-[0_20px_50px_rgba(0,0,0,.6)] overflow-hidden outline-none"
    >
      {/* Header */}
      <div className="flex-none h-[38px] flex items-center justify-between px-3 border-b border-[#232120]">
        <div className="flex items-baseline gap-2">
          <span
            id="model-catalog-panel-title"
            className="font-['Martian_Mono',monospace] text-[9.5px] tracking-[0.1em] text-[#6B655E]"
          >
            MODEL CATALOG
          </span>
          <span className="font-['Martian_Mono',monospace] text-[9px] text-[var(--text-dim)] tracking-[0.06em]">
            ({activeInstalled.length}/{modelsList.length})
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close model catalog"
          className="w-5 h-5 flex items-center justify-center border-none rounded-md bg-transparent text-[#6B655E] text-sm cursor-pointer transition-all duration-150 hover:bg-[#1C1B19] hover:text-[#F2F0ED] focus-visible:ring-1 focus-visible:ring-[var(--border-hover)]"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>

      {/* Model list */}
      <div className="flex-1 overflow-y-auto min-h-0 p-2 space-y-1.5">
        {modelsList.map((m: ModelInfo) => {
          const isInstalled = activeInstalled.includes(m.id);
          const dlPct = downloadingModels[m.id];
          const isDl = dlPct !== undefined;
          const pctVal = isDl ? Math.min(100, Math.max(0, Math.round(dlPct))) : 0;

          return (
            <div
              key={m.id}
              className={`relative p-2.5 rounded-xl border overflow-hidden transition-all duration-200 hover:scale-[1.02] ${
                isDl
                  ? 'border-[var(--accent)] shadow-[0_0_20px_rgba(168,11,36,0.25)] bg-[#140F0E]'
                  : 'border-[var(--border-default)] bg-[var(--bg-elevated)] hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-pill-hover)]'
              }`}
            >
              {/* Horizontal Living Liquid Plasma Fill */}
              {isDl && (
                <div
                  className="absolute inset-y-0 left-0 pointer-events-none transition-all duration-700 ease-out overflow-hidden"
                  style={{
                    width: `${pctVal}%`,
                  }}
                >
                  {/* Soft Translucent Sub-surface Wine Reservoir */}
                  <div
                    className="absolute inset-0"
                    style={{
                      background:
                        'linear-gradient(90deg, rgba(140,8,28,0.22) 0%, rgba(168,11,36,0.16) 75%, rgba(180,20,40,0.22) 100%)',
                    }}
                  />

                  {/* Plasma Liquid Node 1 (Warm Glowing Core) */}
                  <div
                    className="absolute -inset-4 w-[140%] h-[160%] rounded-full opacity-30 blur-2xl animate-plasma-1 pointer-events-none"
                    style={{
                      background:
                        'radial-gradient(circle at 65% 45%, rgba(255,100,125,0.35) 0%, rgba(168,11,36,0.2) 40%, transparent 70%)',
                    }}
                  />

                  {/* Plasma Liquid Node 2 (Rose Specular Highlight) */}
                  <div
                    className="absolute -inset-4 w-[130%] h-[150%] rounded-full opacity-25 blur-xl animate-plasma-2 pointer-events-none"
                    style={{
                      background:
                        'radial-gradient(circle at 85% 55%, rgba(255,190,200,0.35) 0%, rgba(232,138,128,0.15) 45%, transparent 65%)',
                    }}
                  />

                  {/* Subtle Liquid Light Sweep Wave */}
                  <div
                    className="absolute inset-y-0 -left-12 w-24 pointer-events-none animate-shimmer-sweep"
                    style={{
                      background:
                        'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.1) 50%, transparent 100%)',
                    }}
                  />

                  {/* Rising Organic Micro Bubbles */}
                  <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-45">
                    <span className="absolute left-[30%] bottom-0 w-1.5 h-1.5 rounded-full bg-[rgba(255,200,210,0.6)] blur-[0.5px] animate-bubble-1" />
                    <span className="absolute left-[65%] bottom-0 w-2 h-2 rounded-full bg-[rgba(255,170,185,0.5)] blur-[0.5px] animate-bubble-2" />
                    <span
                      className="absolute left-[85%] bottom-0 w-1 h-1 rounded-full bg-[rgba(255,220,230,0.6)] blur-[0.3px] animate-bubble-1"
                      style={{ animationDelay: '1.8s' }}
                    />
                  </div>

                  {/* Soft Feathered Leading Edge (No sharp line or blade) */}
                  <div
                    className="absolute right-0 inset-y-0 w-12 pointer-events-none opacity-40 blur-sm"
                    style={{
                      background:
                        'radial-gradient(ellipse at 100% 50%, rgba(232,138,128,0.4) 0%, transparent 80%)',
                    }}
                  />
                </div>
              )}

              {/* Card Foreground Content */}
              <div className="relative z-10">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-[12px] font-semibold text-[var(--text-primary)] truncate">
                    {m.name}
                  </span>
                  <span className="font-['Martian_Mono',monospace] text-[8.5px] tracking-[0.05em] px-1.5 py-0.5 rounded border border-[var(--border-default)] text-[var(--text-dim)] bg-[rgba(15,14,13,0.6)]">
                    {m.cat.toUpperCase()}
                  </span>
                </div>
                <div className="text-[11px] text-[var(--text-muted)] mb-1.5 line-clamp-2">
                  {m.note}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="font-['Martian_Mono',monospace] text-[8.5px] text-[#5A554F] tracking-[0.04em] truncate">
                    {m.size} · {m.scale}×
                  </div>

                  <div>
                    {m.isCorrupt && !isDl && (
                      <button
                        onClick={() => onDownloadModel(m.id)}
                        className="h-6 px-2.5 border border-[#EF4444] rounded-md bg-[rgba(239,68,68,0.15)] text-[#FCA5A5] font-['Archivo',sans-serif] text-[10.5px] font-semibold cursor-pointer transition-all duration-150 hover:bg-[rgba(239,68,68,0.25)]"
                      >
                        REPAIR
                      </button>
                    )}
                    {isInstalled && !m.isCorrupt && !m.hasUpdate && !isDl && (
                      <span className="font-['Martian_Mono',monospace] text-[8.5px] tracking-[0.06em] text-[var(--success)] px-2 py-0.5 border border-[var(--success-border)] rounded bg-[var(--success-bg)]">
                        INSTALLED
                      </span>
                    )}
                    {isInstalled && !m.isCorrupt && m.hasUpdate && !isDl && (
                      <button
                        onClick={() => onDownloadModel(m.id)}
                        className="h-6 px-2.5 border border-[#F59E0B] rounded-md bg-[rgba(245,158,11,0.15)] text-[#FBBF24] font-['Archivo',sans-serif] text-[10.5px] font-semibold cursor-pointer transition-all duration-150 hover:bg-[rgba(245,158,11,0.25)]"
                      >
                        UPDATE
                      </button>
                    )}
                    {isDl && (
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[var(--accent)] animate-ping" />
                        <span
                          className="font-['Martian_Mono',monospace] text-[9.5px] font-bold tracking-[0.04em]"
                          style={{ color: accentColor }}
                        >
                          {pctVal}%
                        </span>
                      </div>
                    )}
                    {!isInstalled && !m.isCorrupt && !isDl && (
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
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ModelCatalogModal;
