import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { GpuInfo } from "../lib/types";

interface TitlebarProps {
  hasFiles?: boolean;
  currentFile?: string | null;
  originalDims?: { w: number; h: number } | null;
  outputDims?: { w: number; h: number } | null;
  isDone?: boolean;
  selectedGpu?: number;
  availableGpus?: GpuInfo[];
  onSelectGpu?: (gpuId: number) => void;
  isVramOverflowing?: boolean;
  settingsOpen?: boolean;
  onToggleSettings?: () => void;
  onOpenCatalog?: () => void;
  onOpenHistory?: () => void;
  onOpenAbout?: () => void;
  onRemoveFile?: () => void;
  accentColor?: string;
  // Alternate prop names support
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
  isVramOverflowing = false,
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
  const isVid = /\.(mp4|mkv|mov|avi)$/i.test(fileName);
  const kindTag = originalDims ? `${isVid ? 'VID' : 'IMG'} · ${originalDims.w}×${originalDims.h}` : isVid ? 'VID' : 'IMG';
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
          <span className="font-['Martian_Mono',monospace] text-[9px] text-[var(--text-dim)] tracking-[0.06em]">0.1.0</span>
        </div>
      </div>

      {/* File Chip (shown when file is loaded) */}
      {hasFiles && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40">
          <div
            className="flex items-center gap-[11px] h-[34px] pl-3 pr-1.5 border border-[var(--border-subtle)] rounded-[11px] bg-[rgba(15,14,13,.94)] shadow-[var(--shadow-pill)] hover:scale-[1.05] hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-pill-hover)]"
            style={{ transition: "transform .24s var(--ease-spring), border-color .24s ease, box-shadow .24s ease" }}
          >
            <span className="text-xs font-semibold text-[var(--text-primary)] whitespace-nowrap overflow-hidden text-ellipsis min-w-0 max-w-[230px]">{fileName}</span>
            <span className="font-['Martian_Mono',monospace] text-[9px] text-[var(--text-dim)] tracking-[0.05em] whitespace-nowrap">{kindTag}</span>
            {isDone && outDims && (
              <span
                className="inline-block px-[7px] py-[3px] rounded-[6px] font-['Martian_Mono',monospace] text-[9px] tracking-[0.06em] font-semibold whitespace-nowrap bg-[var(--accent-bg)] text-[var(--text-primary)] border border-[var(--border-subtle)]"
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
          className={`absolute top-3 left-1/2 -translate-x-1/2 z-[41] border bg-[rgba(15,14,13,.94)] shadow-[var(--shadow-pill)] overflow-hidden hover:scale-[1.06] hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-pill-hover)] ${
            isVramOverflowing ? "border-[#E88A80] shadow-[0_0_12px_rgba(232,138,128,0.25)]" : "border-[var(--border-subtle)]"
          }`}
          style={{
            width: gpuMenuOpen ? 296 : isVramOverflowing ? 250 : 208,
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
            <span className="absolute left-[44px] right-[40px] text-xs font-semibold text-[var(--text-primary)] whitespace-nowrap overflow-hidden text-ellipsis text-center pointer-events-none">{gpuLabel}</span>
            <span className="flex-1" />
            {isVramOverflowing && (
              <span className="flex-none px-1.5 py-0.5 rounded-full font-['Martian_Mono',monospace] text-[8px] font-bold tracking-[0.06em] bg-[rgba(232,138,128,0.18)] text-[#E88A80] border border-[rgba(232,138,128,0.4)] animate-pulse">
                OVERFLOW
              </span>
            )}
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
                  className="flex items-center gap-[9px] p-2 rounded-[9px] cursor-pointer transition-colors duration-150 hover:bg-[var(--bg-elevated)]"
                  style={{ background: gpu.id === selectedGpu ? "var(--bg-active)" : "transparent" }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-[var(--text-primary)] whitespace-nowrap overflow-hidden text-ellipsis">{gpu.name}</div>
                    <div className="font-['Martian_Mono',monospace] text-[9px] text-[var(--text-dim)] tracking-[0.04em] mt-0.5">{gpu.detail}</div>
                  </div>
                  {gpu.id === selectedGpu && <span className="flex-none w-3 text-[11px]" style={{ color: accentColor }}>✓</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Right navigation pill */}
      <div
        className="absolute top-3 right-3 flex items-center gap-[3px] h-[34px] px-1.5 border border-[var(--border-subtle)] rounded-[11px] bg-[rgba(15,14,13,.94)] shadow-[var(--shadow-pill)] z-40 hover:scale-[1.06] hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-pill-hover)]"
        style={{
          transformOrigin: "right center",
          transition: "transform .24s var(--ease-spring), border-color .24s ease, box-shadow .24s ease",
        }}
      >
        <button
          onClick={handleOpenCatalog}
          className="h-6 px-2 border-none rounded-[7px] bg-transparent text-[var(--text-secondary)] font-['Archivo',sans-serif] text-[11.5px] font-semibold cursor-pointer transition-all duration-150 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          Models
        </button>
        <button
          onClick={handleOpenHistory}
          className="h-6 px-2 border-none rounded-[7px] bg-transparent text-[var(--text-secondary)] font-['Archivo',sans-serif] text-[11.5px] font-semibold cursor-pointer transition-all duration-150 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          History
        </button>
        <button
          onClick={handleOpenSettings}
          className="h-6 px-2 border-none rounded-[7px] bg-transparent font-['Archivo',sans-serif] text-[11.5px] font-semibold cursor-pointer transition-all duration-150"
          style={{
            background: settingsOpen ? "var(--accent-bg)" : "transparent",
            color: settingsOpen ? "var(--text-primary)" : "var(--text-secondary)",
          }}
        >
          Settings
        </button>
        <button
          onClick={handleOpenAbout}
          className="w-6 h-6 flex items-center justify-center border-none rounded-[7px] bg-transparent text-[var(--text-dim)] font-['Martian_Mono',monospace] text-[11px] cursor-pointer transition-all duration-150 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          ?
        </button>
      </div>
    </>
  );
}

export default Titlebar;
