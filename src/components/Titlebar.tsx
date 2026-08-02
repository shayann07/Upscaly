import React, { useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Sparkle, Minus, Square, X, SpeakerHigh, SpeakerSimpleSlash } from '@phosphor-icons/react';

interface TitlebarProps {
  statusText?: string;
  isMuted?: boolean;
  onToggleMute?: () => void;
}

export const Titlebar: React.FC<TitlebarProps> = ({
  statusText = 'Vulkan Engine Ready',
  isMuted = false,
  onToggleMute,
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
      className="fixed top-0 left-0 right-0 h-12 z-50 flex items-center justify-between px-4 select-none border-b border-white/5 bg-[#16141D]/60 backdrop-blur-md"
    >
      {/* App Logo & Title */}
      <div className="flex items-center gap-2 pointer-events-none">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-[#36255C] to-[#D2C3F6] flex items-center justify-center shadow-lg shadow-[#36255C]/40">
          <Sparkle weight="fill" className="w-4 h-4 text-[#F1FEC8]" />
        </div>
        <span className="font-semibold text-sm tracking-wide text-[#F1FEC8]">
          Upscaly
        </span>
        <span className="text-[10px] uppercase font-mono tracking-widest px-2 py-0.5 rounded-full bg-[#36255C]/60 text-[#D2C3F6] border border-[#D2C3F6]/20">
          v1.0
        </span>
      </div>

      {/* Center Status Badge */}
      <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-[#23212C]/80 border border-[#D2C3F6]/10 text-xs text-[#D2C3F6]/80 pointer-events-none">
        <span className="w-2 h-2 rounded-full bg-[#F1FEC8] animate-pulse" />
        <span>{statusText}</span>
      </div>

      {/* Right Action & Window Controls */}
      <div className="flex items-center gap-2">
        {/* Sound Mute Button */}
        {onToggleMute && (
          <button
            onClick={onToggleMute}
            className="p-1.5 rounded-lg text-[#D2C3F6]/70 hover:text-[#F1FEC8] hover:bg-[#36255C]/50 transition-colors"
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
            className="w-3.5 h-3.5 rounded-full bg-yellow-500/80 hover:bg-yellow-400 flex items-center justify-center text-black/60 opacity-80 hover:opacity-100 transition-opacity"
            title="Minimize"
          >
            <Minus size={10} weight="bold" />
          </button>
          <button
            onClick={handleMaximize}
            className="w-3.5 h-3.5 rounded-full bg-green-500/80 hover:bg-green-400 flex items-center justify-center text-black/60 opacity-80 hover:opacity-100 transition-opacity"
            title={isMaximized ? 'Restore' : 'Maximize'}
          >
            <Square size={8} weight="bold" />
          </button>
          <button
            onClick={handleClose}
            className="w-3.5 h-3.5 rounded-full bg-red-500/80 hover:bg-red-400 flex items-center justify-center text-black/60 opacity-80 hover:opacity-100 transition-opacity"
            title="Close"
          >
            <X size={10} weight="bold" />
          </button>
        </div>
      </div>
    </header>
  );
};
