import React, { useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Sparkle, Minus, Square, X, SpeakerHigh, SpeakerSimpleSlash, Cpu, DownloadSimple } from '@phosphor-icons/react';

interface GpuDevice {
  id: number;
  name: string;
}

interface TitlebarProps {
  statusText?: string;
  isMuted?: boolean;
  onToggleMute?: () => void;
  gpus?: GpuDevice[];
  selectedGpu?: number;
  onSelectGpu?: (id: number) => void;
  onOpenModelCatalog?: () => void;
}

export const Titlebar: React.FC<TitlebarProps> = ({
  statusText = 'Vulkan Engine Ready',
  isMuted = false,
  onToggleMute,
  gpus = [],
  selectedGpu = 0,
  onSelectGpu,
  onOpenModelCatalog,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);

  const appWindow = getCurrentWindow();

  const handleMinimize = () => {
    appWindow.minimize();
  };

  const handleMaximize = async () => {
    const maxed = await appWindow.isMaximized();
    if (maxed) {
      appWindow.unmaximize();
      setIsMaximized(false);
    } else {
      appWindow.maximize();
      setIsMaximized(true);
    }
  };

  const handleClose = () => {
    appWindow.close();
  };

  return (
    <header
      data-tauri-drag-region
      className="fixed top-0 left-0 right-0 h-12 z-50 flex items-center justify-between px-4 select-none border-b border-white/5 bg-[#16141D]/80 backdrop-blur-xl"
    >
      {/* App Logo & Title */}
      <div className="flex items-center gap-2 pointer-events-none">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-[#36255C] to-[#D2C3F6] flex items-center justify-center shadow-lg shadow-[#36255C]/40">
          <Sparkle weight="fill" className="w-4 h-4 text-[#F1FEC8]" />
        </div>
        <span className="font-bold text-sm tracking-wide text-[#F1FEC8]">
          Upscaly
        </span>
        <span className="text-[10px] uppercase font-mono tracking-widest px-2 py-0.5 rounded-full bg-[#36255C]/60 text-[#D2C3F6] border border-[#D2C3F6]/20">
          v1.0
        </span>
      </div>

      {/* Center Status Badge & Controls */}
      <div className="flex items-center gap-3">
        {/* Status Pill */}
        <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-[#23212C]/90 border border-[#D2C3F6]/15 text-xs text-[#D2C3F6]/90 pointer-events-none shadow-sm">
          <span className="w-2 h-2 rounded-full bg-[#F1FEC8] animate-pulse" />
          <span>{statusText}</span>
        </div>

        {/* GPU Selector */}
        {gpus.length > 0 && onSelectGpu && (
          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#23212C]/90 border border-[#D2C3F6]/15 text-xs text-[#D2C3F6]">
            <Cpu size={14} className="text-[#F1FEC8]" />
            <select
              value={selectedGpu}
              onChange={(e) => onSelectGpu(Number(e.target.value))}
              className="bg-transparent text-xs text-[#D2C3F6] focus:outline-none cursor-pointer pr-1"
            >
              {gpus.map((g) => (
                <option key={g.id} value={g.id} className="bg-[#16141D] text-[#D2C3F6]">
                  GPU {g.id}: {g.name.length > 20 ? g.name.substring(0, 20) + "..." : g.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Model Catalog Button */}
        {onOpenModelCatalog && (
          <button
            onClick={onOpenModelCatalog}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#36255C]/80 hover:bg-[#36255C] border border-[#D2C3F6]/30 text-xs text-[#F1FEC8] transition-all cursor-pointer"
          >
            <DownloadSimple size={14} weight="bold" />
            <span>Model Catalog</span>
          </button>
        )}
      </div>

      {/* Right Window Controls */}
      <div className="flex items-center gap-2">
        {/* Sound Mute Button */}
        {onToggleMute && (
          <button
            onClick={onToggleMute}
            className="p-1.5 rounded-lg text-[#D2C3F6]/70 hover:text-[#F1FEC8] hover:bg-[#36255C]/50 transition-colors cursor-pointer"
            title={isMuted ? 'Unmute Sound FX' : 'Mute Sound FX'}
          >
            {isMuted ? (
              <SpeakerSimpleSlash size={16} />
            ) : (
              <SpeakerHigh size={16} />
            )}
          </button>
        )}

        {/* Window Controls */}
        <div className="flex items-center gap-1.5 pl-2 border-l border-white/10">
          <button
            onClick={handleMinimize}
            className="w-3.5 h-3.5 rounded-full bg-yellow-500/80 hover:bg-yellow-400 flex items-center justify-center text-black/60 opacity-80 hover:opacity-100 transition-opacity cursor-pointer"
            title="Minimize"
          >
            <Minus size={10} weight="bold" />
          </button>
          <button
            onClick={handleMaximize}
            className="w-3.5 h-3.5 rounded-full bg-green-500/80 hover:bg-green-400 flex items-center justify-center text-black/60 opacity-80 hover:opacity-100 transition-opacity cursor-pointer"
            title={isMaximized ? 'Restore' : 'Maximize'}
          >
            <Square size={8} weight="bold" />
          </button>
          <button
            onClick={handleClose}
            className="w-3.5 h-3.5 rounded-full bg-red-500/80 hover:bg-red-400 flex items-center justify-center text-black/60 opacity-80 hover:opacity-100 transition-opacity cursor-pointer"
            title="Close"
          >
            <X size={10} weight="bold" />
          </button>
        </div>
      </div>
    </header>
  );
};
