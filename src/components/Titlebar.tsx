import { GpuInfo } from "../lib/types";
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface TitlebarProps {
  hasFiles?: boolean;
  currentFile?: string | null;
  originalDims?: { w: number; h: number } | null;
  outputDims?: { w: number; h: number } | null;
  isDone?: boolean;
  selectedGpu?: number;
  availableGpus?: GpuInfo[];
  onSelectGpu?: (id: number) => void;
  settingsOpen?: boolean;
  onToggleSettings?: () => void;
  onOpenCatalog?: () => void;
  onOpenHistory?: () => void;
  onOpenAbout?: () => void;
  onRemoveFile?: () => void;
  accentColor?: string;
  // Legacy / alternate props support
  onShowModelCatalog?: () => void;
  onShowSettings?: () => void;
  onShowAbout?: () => void;
  onShowHistory?: () => void;
  onToggleInspector?: () => void;
  isInspectorOpen?: boolean;
}

export function Titlebar({
  hasFiles = false,
  currentFile = null,
  originalDims = null,
  outputDims = null,
  isDone = false,
  selectedGpu = 0,
  availableGpus = [],
  onSelectGpu = () => {},
  settingsOpen = false,
  onToggleSettings = () => {},
  onOpenCatalog = () => {},
  onOpenHistory = () => {},
  onOpenAbout = () => {},
  onRemoveFile = () => {},
  accentColor = "var(--accent)",
  onShowModelCatalog,
  onShowSettings,
  onShowAbout,
  onShowHistory,
  onToggleInspector,
  isInspectorOpen,
}: TitlebarProps) {
  const [gpuMenuOpen, setGpuMenuOpen] = useState(false);

  const handleOpenCatalog = onOpenCatalog || onShowModelCatalog || (() => {});
  const handleOpenSettings = onToggleSettings || onToggleInspector || onShowSettings || (() => {});
  const handleOpenAbout = onOpenAbout || onShowAbout || (() => {});
  const handleOpenHistory = onOpenHistory || onShowHistory || (() => {});

  const handleClose = () => {
    invoke("close_window").catch(() => {});
  };

  const handleMinimize = () => {
    invoke("minimize_window").catch(() => {});
  };

  const handleMaximize = () => {
    invoke("toggle_maximize_window").catch(() => {});
  };

  const fileName = currentFile?.split(/[\\/]/).pop() || "";
  const kindTag = originalDims ? `IMG · ${originalDims.w}×${originalDims.h}` : "";
  const outDims = outputDims ? `${outputDims.w}×${outputDims.h}` : "";
  const gpuLabel = (availableGpus.find((g) => g.id === selectedGpu) || availableGpus[0])?.name?.replace("NVIDIA ", "") || "CPU";

  return (
    <>
      {/* App brand pill */}
      <div className="absolute top-3 left-3 flex items-center gap-2 z-40">
        <div
          data-tauri-drag-region
          className="flex items-center gap-3 h-[34px] px-3 border border-[var(--border-subtle)] rounded-[11px] bg-[rgba(15,14,13,.94)] shadow-[var(--shadow-pill)] hover:scale-[1.06] hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-pill-hover)]"
          style={{
            transformOrigin: "left center",
            transition: "transform .24s var(--ease-spring), border-color .24s ease, box-shadow .24s ease",
          }}
        >
          <div className="flex items-center gap-[7px]">
            <div
              onClick={handleClose}
              className="w-[11px] h-[11px] rounded-full bg-[#FF5F57] flex items-center justify-center font-['Martian_Mono',monospace] text-[9px] font-bold leading-none text-transparent cursor-pointer transition-colors duration-150 hover:text-[#3C0401]"
            >
              ✕
            </div>
            <div
              onClick={handleMinimize}
              className="w-[11px] h-[11px] rounded-full bg-[#FEBC2E] flex items-center justify-center font-['Martian_Mono',monospace] text-[11px] font-bold leading-none text-transparent cursor-pointer transition-colors duration-150 hover:text-[#462C01]"
            >
              −
            </div>
            <div
              onClick={handleMaximize}
              className="w-[11px] h-[11px] rounded-full bg-[#28C840] flex items-center justify-center font-['Martian_Mono',monospace] text-[8px] font-bold leading-none text-transparent cursor-pointer transition-colors duration-150 hover:text-[#032C09]"
            >
              ▢
            </div>
          </div>
          <div className="w-px h-[15px] bg-[var(--border-default)]" />
          <span className="font-bold text-[12.5px] tracking-[-0.01em]">Upscaly</span>
          <span className="font-['Martian_Mono',monospace] text-[9px] text-[var(--text-muted)] tracking-[0.06em]">0.1.0</span>
        </div>
      </div>

      {/* File chip (center top) */}
      {hasFiles && currentFile && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 max-w-[calc(100%-470px)] z-[41] flex">
          <div
            className="flex items-center gap-[11px] h-[34px] px-3 pr-1.5 border border-[var(--border-subtle)] rounded-[11px] bg-[rgba(15,14,13,.94)] shadow-[var(--shadow-pill)] hover:scale-[1.05] hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-pill-hover)]"
            style={{ transition: "transform .24s var(--ease-spring), border-color .24s ease, box-shadow .24s ease" }}
          >
            <span className="text-xs font-semibold text-[var(--text-primary)] whitespace-nowrap overflow-hidden text-ellipsis min-w-0 max-w-[230px]">{fileName}</span>
            <span className="font-['Martian_Mono',monospace] text-[9px] text-[var(--text-dim)] tracking-[0.05em] whitespace-nowrap">{kindTag}</span>
            {isDone && (
              <span
                className="inline-block px-[7px] py-[3px] rounded-[6px] font-['Martian_Mono',monospace] text-[9px] tracking-[0.06em] font-semibold whitespace-nowrap"
                style={{ background: accentColor, color: "#0B0A09" }}
              >
                {outDims}
              </span>
            )}
            <button
              onClick={onRemoveFile}
              title="Remove from queue"
              className="w-6 h-6 flex-none flex items-center justify-center border border-[var(--border-danger)] rounded-lg bg-[var(--danger-bg)] text-[var(--danger-text)] text-sm leading-none cursor-pointer transition-all duration-150 hover:bg-[var(--danger-hover)] hover:text-[#F2C4BE]"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* GPU Island (shown when no active single file) */}
      {!hasFiles && (
        <div
          className="absolute top-3 left-1/2 -translate-x-1/2 z-[41] border border-[var(--border-subtle)] bg-[rgba(15,14,13,.94)] shadow-[var(--shadow-pill)] overflow-hidden hover:scale-[1.06] hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-pill-hover)]"
          style={{
            width: gpuMenuOpen ? 296 : 208,
            borderRadius: gpuMenuOpen ? 14 : 11,
            transformOrigin: "top center",
            transition: "width .28s var(--ease-spring), transform .24s var(--ease-spring), border-radius .24s ease, border-color .24s ease, box-shadow .24s ease",
          }}
        >
          <button
            onClick={() => setGpuMenuOpen((prev) => !prev)}
            className="relative w-full flex items-center gap-[9px] h-[34px] px-3 border-none bg-transparent cursor-pointer transition-colors duration-150"
          >
            <span className="font-['Martian_Mono',monospace] text-[9.5px] tracking-[0.07em] text-[var(--text-dim)] flex-none">GPU</span>
            <span className="absolute left-[44px] right-[32px] text-xs font-semibold text-[var(--text-primary)] whitespace-nowrap overflow-hidden text-ellipsis text-center pointer-events-none">{gpuLabel}</span>
            <span className="flex-1" />
            <span
              className="flex-none text-[var(--text-dim)] text-[9px] transition-transform duration-300"
              style={{ transform: `rotate(${gpuMenuOpen ? 180 : 0}deg)`, transition: "transform .24s var(--ease-spring)" }}
            >
              ▾
            </span>
          </button>
          <div
            className="overflow-hidden transition-all duration-300"
            style={{
              maxHeight: gpuMenuOpen ? 210 : 0,
              opacity: gpuMenuOpen ? 1 : 0,
              transition: "max-height .28s var(--ease-spring), opacity .2s ease",
            }}
          >
            <div className="p-1.5 border-t border-[var(--border-default)]">
              {availableGpus.map((gpu) => (
                <div
                  key={gpu.id}
                  onClick={() => {
                    onSelectGpu(gpu.id);
                    setGpuMenuOpen(false);
                  }}
                  className="flex items-center gap-[11px] p-[11px] cursor-pointer rounded-[10px] transition-colors duration-150"
                  style={{ background: selectedGpu === gpu.id ? "var(--bg-active)" : "transparent" }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-[var(--text-primary)] whitespace-nowrap overflow-hidden text-ellipsis">{gpu.name}</div>
                    <div className="font-['Martian_Mono',monospace] text-[9px] text-[var(--text-dim)] tracking-[0.04em] mt-0.5">{gpu.detail}</div>
                  </div>
                  {selectedGpu === gpu.id && <span className="flex-none w-3 text-[11px]" style={{ color: accentColor }}>✓</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Right nav buttons */}
      <div
        className="absolute top-3 right-3 flex items-center gap-[3px] h-[34px] px-[5px] border border-[var(--border-subtle)] rounded-[11px] bg-[rgba(15,14,13,.94)] shadow-[var(--shadow-pill)] z-40 hover:scale-[1.06] hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-pill-hover)]"
        style={{ transformOrigin: "right center", transition: "transform .24s var(--ease-spring), border-color .24s ease, box-shadow .24s ease" }}
      >
        <button onClick={handleOpenCatalog} className="h-6 px-[9px] border-none rounded-[7px] bg-transparent text-[var(--text-secondary)] font-['Archivo',sans-serif] text-[11.5px] font-semibold cursor-pointer transition-all duration-150 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]">
          Models
        </button>
        <button onClick={handleOpenHistory} className="h-6 px-[9px] border-none rounded-[7px] bg-transparent text-[var(--text-secondary)] font-['Archivo',sans-serif] text-[11.5px] font-semibold cursor-pointer transition-all duration-150 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]">
          History
        </button>
        <button
          onClick={handleOpenSettings}
          className="h-6 px-[9px] border-none rounded-[7px] font-['Archivo',sans-serif] text-[11.5px] font-semibold cursor-pointer transition-all duration-150 hover:text-[var(--text-primary)]"
          style={{
            background: settingsOpen || isInspectorOpen ? "#2A2725" : "transparent",
            color: settingsOpen || isInspectorOpen ? "var(--text-primary)" : "var(--text-secondary)",
          }}
        >
          Settings
        </button>
        <button onClick={handleOpenAbout} className="w-6 h-6 flex items-center justify-center border-none rounded-[7px] bg-transparent text-[var(--text-muted)] font-['Martian_Mono',monospace] text-[11px] cursor-pointer transition-all duration-150 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]">
          ?
        </button>
      </div>
    </>
  );
}

export default Titlebar;
