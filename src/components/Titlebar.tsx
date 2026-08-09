import { useState } from 'react';
import { GpuInfo } from '../lib/types';
import { WindowControls } from './titlebar/WindowControls';
import { TitlebarNav } from './titlebar/TitlebarNav';

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
  activeNavTab?: 'models' | 'history' | 'settings' | 'about' | null;
  onToggleNavTab?: (tab: 'models' | 'history' | 'settings' | 'about') => void;
  settingsOpen?: boolean;
  onToggleSettings?: () => void;
  onOpenCatalog?: () => void;
  onOpenHistory?: () => void;
  onOpenAbout?: () => void;
  onRemoveFile?: () => void;
  accentColor?: string;
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
  outputDims = null,
  isDone = false,
  selectedGpu = 0,
  availableGpus = [],
  onSelectGpu = () => {},
  isVramOverflowing = false,
  activeNavTab,
  onToggleNavTab,
  settingsOpen = false,
  onToggleSettings = () => {},
  onOpenCatalog = () => {},
  onOpenHistory = () => {},
  onOpenAbout = () => {},
  onRemoveFile = () => {},
  accentColor = 'var(--accent)',
  onShowModelCatalog,
  onShowSettings,
  onShowAbout,
  onShowHistory,
  onToggleInspector,
  isInspectorOpen,
}: TitlebarProps) {
  const [gpuMenuOpen, setGpuMenuOpen] = useState(false);

  const handleCatalog = onOpenCatalog || onShowModelCatalog || (() => {});
  const handleToggleInspector =
    onToggleSettings || onToggleInspector || onShowSettings || (() => {});
  const handleHistory = onOpenHistory || onShowHistory || (() => {});
  const handleAbout = onOpenAbout || onShowAbout || (() => {});
  const inspectorActive =
    activeNavTab === 'settings' || settingsOpen || isInspectorOpen || false;

  const currentGpu = availableGpus.find((g) => g.id === selectedGpu);
  const gpuLabel = currentGpu ? currentGpu.name : 'GPU Acceleration';

  const fileName = currentFile
    ? currentFile.split('/').pop()?.split('\\').pop()
    : '';
  const isVideo = fileName
    ? /\.(mp4|mkv|mov|avi|webm)$/i.test(fileName)
    : false;
  const kindTag = isVideo ? 'VID' : 'IMG';
  const outDims = outputDims ? `${outputDims.w}×${outputDims.h}` : '';

  return (
    <header className="absolute top-0 left-0 right-0 h-14 z-[40] flex items-center justify-between px-3 select-none pointer-events-none">
      <WindowControls />

      {hasFiles && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 pointer-events-auto">
          <div className="flex items-center gap-[11px] h-[34px] pl-3 pr-1.5 border border-[var(--border-subtle)] rounded-[11px] bg-[rgba(15,14,13,.94)] shadow-[var(--shadow-pill)] transition-all duration-200 hover:scale-[1.03] hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-pill-hover)]">
            <span className="text-xs font-semibold text-[var(--text-primary)] whitespace-nowrap overflow-hidden text-ellipsis min-w-0 max-w-[230px]">
              {fileName}
            </span>
            <span className="font-['Martian_Mono',monospace] text-[9px] text-[var(--text-dim)] tracking-[0.05em] whitespace-nowrap">
              {kindTag}
            </span>
            {isDone && outDims && (
              <span className="inline-block px-[7px] py-[3px] rounded-[6px] font-['Martian_Mono',monospace] text-[9px] tracking-[0.06em] font-semibold whitespace-nowrap bg-[var(--accent-bg)] text-[var(--text-primary)] border border-[var(--border-subtle)]">
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

      {!hasFiles && (
        <div
          className={`absolute top-3 left-1/2 -translate-x-1/2 z-[41] border bg-[rgba(15,14,13,.94)] shadow-[var(--shadow-pill)] overflow-hidden transition-all duration-200 hover:scale-[1.03] hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-pill-hover)] ${
            isVramOverflowing
              ? 'border-[#E88A80] shadow-[0_0_12px_rgba(232,138,128,0.25)]'
              : 'border-[var(--border-subtle)]'
          }`}
          style={{
            width: gpuMenuOpen ? 310 : isVramOverflowing ? 275 : 210,
            borderRadius: gpuMenuOpen ? 14 : 11,
            transformOrigin: 'top center',
          }}
        >
          <button
            onClick={() => setGpuMenuOpen((prev) => !prev)}
            className="w-full flex items-center justify-between gap-2 h-[34px] px-3 border-none bg-transparent cursor-pointer transition-colors duration-150 pointer-events-auto"
          >
            <span className="font-['Martian_Mono',monospace] text-[9.5px] tracking-[0.07em] text-[var(--text-dim)] flex-none">
              GPU
            </span>
            <span className="text-xs font-semibold text-[var(--text-primary)] whitespace-nowrap overflow-hidden text-ellipsis flex-1 min-w-0 text-center">
              {gpuLabel}
            </span>
            {isVramOverflowing && (
              <span className="flex-none px-1.5 py-0.5 rounded-full font-['Martian_Mono',monospace] text-[8px] font-bold tracking-[0.06em] bg-[rgba(232,138,128,0.18)] text-[#E88A80] border border-[rgba(232,138,128,0.4)] animate-pulse">
                OVERFLOW
              </span>
            )}
            <span
              className="flex-none text-[var(--text-dim)] text-[9px] transition-transform duration-300"
              style={{
                transform: `rotate(${gpuMenuOpen ? 180 : 0}deg)`,
                transition: 'transform .24s var(--ease-spring)',
              }}
            >
              ▾
            </span>
          </button>
          <div
            className="overflow-hidden transition-all duration-300"
            style={{
              maxHeight: gpuMenuOpen ? 210 : 0,
              opacity: gpuMenuOpen ? 1 : 0,
              transition:
                'max-height .28s var(--ease-spring), opacity .2s ease',
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
                  className="flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors duration-150 hover:bg-[var(--bg-hover)]"
                  style={{
                    background:
                      selectedGpu === gpu.id
                        ? 'var(--bg-active)'
                        : 'transparent',
                  }}
                >
                  <div className="flex-1 min-w-0 pr-2">
                    <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                      {gpu.name}
                    </div>
                    <div className="font-['Martian_Mono',monospace] text-[9px] text-[var(--text-dim)]">
                      {gpu.detail}
                    </div>
                  </div>
                  {selectedGpu === gpu.id && (
                    <span className="text-xs" style={{ color: accentColor }}>
                      ✓
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <TitlebarNav
        activeNavTab={activeNavTab}
        onToggleNavTab={onToggleNavTab}
        inspectorActive={inspectorActive}
        handleCatalog={handleCatalog}
        handleHistory={handleHistory}
        handleToggleInspector={handleToggleInspector}
        handleAbout={handleAbout}
      />
    </header>
  );
}

export default Titlebar;
