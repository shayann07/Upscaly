import React, { useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Sparkle, Minus, Square, X, SpeakerHigh, SpeakerSimpleSlash, Cpu, DownloadSimple } from '@phosphor-icons/react';
import { CustomSelect } from './CustomSelect';

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

  const gpuOptions = gpus.map((g) => ({
    value: g.id,
    label: `GPU ${g.id}: ${g.name.length > 22 ? g.name.substring(0, 22) + '...' : g.name}`,
    sublabel: g.name,
  }));

  return (
    <header
      data-tauri-drag-region
      className="fixed top-0 left-0 right-0 h-13 z-50 flex items-center justify-between px-4 select-none border-b border-white/10 bg-[#16141D]/75 backdrop-blur-2xl shadow-xl"
    >
      {/* App Logo & Title */}
      <div className="flex items-center gap-2.5 pointer-events-none">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#36255C] via-[#4A3078] to-[#D2C3F6] border border-[#F1FEC8]/30 flex items-center justify-center shadow-lg shadow-[#36255C]/60">
          <Sparkle weight="fill" className="w-4.5 h-4.5 text-[#F1FEC8] animate-pulse" />
        </div>
        <span className="font-extrabold text-sm tracking-wider text-[#F1FEC8] drop-shadow-md">
          Upscaly
        </span>
        <span className="text-[9px] font-bold uppercase font-mono tracking-widest px-2 py-0.5 rounded-full bg-[#36255C]/80 text-[#D2C3F6] border border-[#D2C3F6]/30 shadow-inner">
          v1.0
        </span>
      </div>

      {/* Center Status Badge & Custom GPU Select & Controls */}
      <div className="flex items-center gap-3">
        {/* Status Pill */}
        <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-[#23212C]/90 border border-[#D2C3F6]/20 text-xs font-semibold text-[#D2C3F6] pointer-events-none shadow-md">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#34D399]" />
          <span>{statusText}</span>
        </div>

        {/* Custom GPU Select Dropdown */}
        {gpus.length > 0 && onSelectGpu && (
          <div className="hidden md:block w-64">
            <CustomSelect
              options={gpuOptions}
              value={selectedGpu}
              onChange={(val) => onSelectGpu(Number(val))}
              icon={<Cpu size={15} className="text-[#F1FEC8]" />}
            />
          </div>
        )}

        {/* Model Catalog Button */}
        {onOpenModelCatalog && (
          <button
            onClick={onOpenModelCatalog}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#36255C] to-[#4A3078] hover:from-[#4A3078] hover:to-[#5E3C98] border border-[#D2C3F6]/30 text-xs font-bold text-[#F1FEC8] shadow-lg shadow-[#36255C]/40 transition-all hover:scale-105 active:scale-95 cursor-pointer"
          >
            <DownloadSimple size={14} weight="bold" />
            <span>Model Catalog</span>
          </button>
        )}
      </div>

      {/* Right Window Controls & Mute */}
      <div className="flex items-center gap-3">
        {/* Sound Mute Button */}
        {onToggleMute && (
          <button
            onClick={onToggleMute}
            className="p-2 rounded-xl text-[#D2C3F6]/70 hover:text-[#F1FEC8] hover:bg-[#36255C]/60 border border-transparent hover:border-[#D2C3F6]/20 transition-all cursor-pointer shadow-sm active:scale-90"
            title={isMuted ? 'Unmute Sound FX' : 'Mute Sound FX'}
          >
            {isMuted ? (
              <SpeakerSimpleSlash size={16} />
            ) : (
              <SpeakerHigh size={16} />
            )}
          </button>
        )}

        {/* High-End Mac/Liquid Window Control Buttons */}
        <div className="flex items-center gap-2 pl-3 border-l border-white/10">
          {/* Minimize Button (Yellow) */}
          <button
            onClick={handleMinimize}
            className="w-3.5 h-3.5 rounded-full bg-gradient-to-tr from-amber-500 to-yellow-300 border border-amber-300/50 flex items-center justify-center text-amber-950 opacity-90 hover:opacity-100 hover:scale-115 active:scale-90 transition-all cursor-pointer shadow-[0_0_8px_rgba(245,158,11,0.4)] group"
            title="Minimize"
          >
            <Minus size={9} weight="bold" className="opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>

          {/* Maximize Button (Green) */}
          <button
            onClick={handleMaximize}
            className="w-3.5 h-3.5 rounded-full bg-gradient-to-tr from-emerald-500 to-green-300 border border-emerald-300/50 flex items-center justify-center text-emerald-950 opacity-90 hover:opacity-100 hover:scale-115 active:scale-90 transition-all cursor-pointer shadow-[0_0_8px_rgba(16,185,129,0.4)] group"
            title={isMaximized ? 'Restore' : 'Maximize'}
          >
            <Square size={8} weight="bold" className="opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>

          {/* Close Button (Red) */}
          <button
            onClick={handleClose}
            className="w-3.5 h-3.5 rounded-full bg-gradient-to-tr from-rose-600 to-red-400 border border-rose-300/50 flex items-center justify-center text-rose-950 opacity-90 hover:opacity-100 hover:scale-115 active:scale-90 transition-all cursor-pointer shadow-[0_0_8px_rgba(244,63,94,0.4)] group"
            title="Close"
          >
            <X size={9} weight="bold" className="opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        </div>
      </div>
    </header>
  );
};
