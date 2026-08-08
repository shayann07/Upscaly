import { useState } from "react";
import { SUPPORTED_MODELS, ModelInfo } from "../lib/types";

interface SettingsPanelProps {
  modelCategory?: "photo" | "anime" | "video";
  onSetCategory?: (cat: "photo" | "anime" | "video") => void;
  category?: "photos" | "anime" | "video";
  onSelectCategory?: (cat: "photos" | "anime" | "video") => void;
  selectedModel: string;
  onSelectModel: (id: string) => void;
  selectedScale?: number;
  scale?: number;
  onSelectScale: (s: number) => void;
  isProcessing?: boolean;
  hasFiles?: boolean;
  isBatchMode?: boolean;
  onRun?: () => void;
  onCancel?: () => void;
  onOpenCatalog?: () => void;
  accentColor?: string;
  installedModels?: string[];
}

export function SettingsPanel({
  modelCategory = "photo",
  onSetCategory,
  category = "photos",
  onSelectCategory,
  selectedModel,
  onSelectModel,
  selectedScale,
  scale = 4,
  onSelectScale,
  isProcessing = false,
  hasFiles = true,
  isBatchMode = false,
  onRun = () => {},
  onCancel = () => {},
  onOpenCatalog = () => {},
  accentColor = "var(--accent)",
}: SettingsPanelProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);

  const activeCategory = category === "photos" ? "photo" : category === "anime" ? "anime" : category === "video" ? "video" : modelCategory;
  const activeScale = selectedScale !== undefined ? selectedScale : scale;

  const handleCategory = (cat: "photo" | "anime" | "video") => {
    if (onSetCategory) onSetCategory(cat);
    if (onSelectCategory) {
      const altCat = cat === "photo" ? "photos" : cat;
      onSelectCategory(altCat);
    }
  };

  const big = isHovered;
  const EASE = "var(--ease-spring)";

  const model = SUPPORTED_MODELS.find((m: ModelInfo) => m.id === selectedModel) || SUPPORTED_MODELS[0];
  const filteredModels = SUPPORTED_MODELS.filter((m: ModelInfo) => m.cat === activeCategory);

  const pill = (active: boolean, isBig: boolean) => ({
    height: isBig ? 32 : 26,
    padding: `0 ${isBig ? 14 : 11}px`,
    borderRadius: 10,
    border: `1px solid ${active ? accentColor : "transparent"}`,
    background: active ? "var(--accent-bg)" : "transparent",
    color: active ? "var(--text-primary)" : "var(--text-dim)",
    fontFamily: "Archivo, sans-serif",
    fontSize: isBig ? "12.5px" : "11.5px",
    fontWeight: 600 as const,
    cursor: "pointer" as const,
    whiteSpace: "nowrap" as const,
    transition: `all .22s ${EASE}`,
  });

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="flex items-center"
      style={{
        gap: big ? 8 : 6,
        padding: big ? 6 : 5,
        border: "1px solid var(--border-subtle)",
        borderRadius: 16,
        background: "rgba(13,12,11,.96)",
        boxShadow: `0 ${big ? 22 : 14}px ${big ? 50 : 34}px rgba(0,0,0,.6)`,
        transition: `all .24s ${EASE}`,
      }}
    >
      {/* Category tabs */}
      <div className="flex gap-0.5 p-0.5 border border-[var(--border-default)] rounded-xl bg-[var(--bg-elevated)]">
        <button onClick={() => handleCategory("photo")} style={pill(activeCategory === "photo", big)}>Photo</button>
        <button onClick={() => handleCategory("anime")} style={pill(activeCategory === "anime", big)}>Anime</button>
        <button onClick={() => handleCategory("video")} style={pill(activeCategory === "video", big)}>Video</button>
      </div>

      {/* Model selector */}
      <div className="relative flex-none" style={{ width: big ? 206 : 162, transition: `width .24s ${EASE}` }}>
        <button
          onClick={() => setModelMenuOpen((prev) => !prev)}
          className="w-full flex items-center gap-[9px] border border-[var(--border-default)] rounded-[11px] bg-[var(--bg-elevated)] cursor-pointer transition-all duration-300 hover:border-[#454138]"
          style={{ height: big ? 36 : 30, padding: "0 11px", transition: `all .24s ${EASE}` }}
        >
          <div className="flex-1 min-w-0 text-left">
            <div className="text-xs font-semibold text-[var(--text-primary)] whitespace-nowrap overflow-hidden text-ellipsis">{model.name}</div>
            {big && (
              <div className="font-['Martian_Mono',monospace] text-[9px] text-[var(--text-dim)] tracking-[0.04em] mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis">
                {model.id.toUpperCase()} · {model.size}
              </div>
            )}
          </div>
          <span className="flex-none text-[var(--text-dim)] text-[9px]">▲</span>
        </button>

        {/* Model dropdown */}
        {modelMenuOpen && (
          <div className="absolute bottom-[calc(100%+10px)] left-0 w-[376px] border border-[var(--border-subtle)] rounded-[14px] bg-[var(--bg-surface)] shadow-[0_24px_60px_rgba(0,0,0,.7)] p-2 z-[80]" style={{ animation: "pop .2s var(--ease-bounce) both" }}>
            {filteredModels.map((m: ModelInfo) => (
              <div
                key={m.id}
                onClick={() => {
                  onSelectModel(m.id);
                  setModelMenuOpen(false);
                }}
                className="flex items-start gap-3 p-3 rounded-[10px] cursor-pointer transition-colors duration-150"
                style={{ background: m.id === selectedModel ? "var(--bg-active)" : "transparent" }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-[7px]">
                    <span className="text-[12.5px] font-semibold text-[var(--text-primary)]">{m.name}</span>
                    <span className="font-['Martian_Mono',monospace] text-[9px] tracking-[0.05em] px-1.5 py-[3px] rounded-[6px] border border-[var(--border-subtle)] text-[var(--text-tertiary)]">
                      {m.scale}×
                    </span>
                  </div>
                  <div className="text-[11.5px] text-[var(--text-muted)] mt-[3px] leading-[1.4]">{m.note}</div>
                </div>
                {m.id === selectedModel && <span className="flex-none w-3 text-[11px]" style={{ color: accentColor }}>✓</span>}
              </div>
            ))}
            <div
              onClick={() => {
                setModelMenuOpen(false);
                onOpenCatalog();
              }}
              className="mt-1 px-2.5 py-[9px] border-t border-[var(--border-default)] font-['Martian_Mono',monospace] text-[10px] tracking-[0.06em] text-[var(--accent)] cursor-pointer"
            >
              BROWSE FULL CATALOG →
            </div>
          </div>
        )}
      </div>

      {/* Scale buttons */}
      <div className="flex gap-0.5 p-0.5 border border-[var(--border-default)] rounded-xl bg-[var(--bg-elevated)]">
        <button onClick={() => onSelectScale(2)} style={pill(activeScale === 2, big)}>2×</button>
        <button onClick={() => onSelectScale(3)} style={pill(activeScale === 3, big)}>3×</button>
        <button onClick={() => onSelectScale(4)} style={pill(activeScale === 4, big)}>4×</button>
      </div>

      {/* Primary action button */}
      <button
        disabled={isProcessing || !hasFiles}
        onClick={onRun}
        className="flex-none flex items-center gap-2 font-['Archivo',sans-serif] font-semibold whitespace-nowrap transition-all duration-300 hover:-translate-y-0.5"
        style={{
          height: big ? 36 : 30,
          padding: `0 ${big ? 18 : 14}px`,
          border: "none",
          borderRadius: 11,
          background: isProcessing ? "#1B1917" : hasFiles ? "var(--text-primary)" : "#1B1917",
          color: isProcessing ? "var(--text-dim)" : hasFiles ? "var(--bg-base)" : "var(--text-dim)",
          fontSize: big ? "13px" : "12px",
          cursor: hasFiles && !isProcessing ? "pointer" : "not-allowed",
          transition: `all .24s ${EASE}`,
        }}
      >
        <span>{isProcessing ? "Processing..." : isBatchMode ? "Run queue" : "Upscale"}</span>
        {big && !isProcessing && (
          <span className="font-['Martian_Mono',monospace] text-[9px] opacity-50 tracking-[0.04em]">
            ⌘↩
          </span>
        )}
      </button>
    </div>
  );
}

export default SettingsPanel;
