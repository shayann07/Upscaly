import React from 'react';
import { openPath, revealItemInDir } from '@tauri-apps/plugin-opener';
import { FolderOpen, ArrowSquareOut, ArrowsCounterClockwise, Sparkle } from '@phosphor-icons/react';

interface CompletionCardProps {
  outputPath: string;
  onReset: () => void;
}

export const CompletionCard: React.FC<CompletionCardProps> = ({ outputPath, onReset }) => {
  const fileName = outputPath.split(/[/\\]/).pop() || outputPath;

  const handleOpenFile = async () => {
    try {
      await openPath(outputPath);
    } catch (err) {
      console.error('Failed to open file:', err);
    }
  };

  const handleShowInExplorer = async () => {
    try {
      await revealItemInDir(outputPath);
    } catch (err) {
      console.error('Failed to reveal file in Explorer:', err);
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto rounded-3xl liquid-glass border border-[#F1FEC8]/30 p-6 space-y-6 select-none shadow-2xl relative overflow-hidden text-center">
      {/* Background Sparkle Sheen */}
      <div className="absolute -top-12 -right-12 w-40 h-40 bg-[#F1FEC8]/10 rounded-full blur-2xl pointer-events-none" />

      {/* Hero Icon */}
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#36255C] via-[#4A3078] to-[#D2C3F6] border border-[#F1FEC8]/40 flex items-center justify-center text-[#F1FEC8] mx-auto shadow-lg shadow-[#36255C]/50 relative z-10">
        <Sparkle size={36} weight="fill" className="animate-pulse" />
      </div>

      {/* Header Text */}
      <div className="space-y-1 relative z-10">
        <h2 className="text-lg font-extrabold text-[#F1FEC8] tracking-wide">
          Upscaling Successfully Completed!
        </h2>
        <p className="text-xs text-[#D2C3F6]/80 font-mono truncate max-w-md mx-auto">
          {fileName}
        </p>
      </div>

      {/* File Location Info Box */}
      <div className="p-3 rounded-2xl bg-[#23212C]/80 border border-[#D2C3F6]/15 text-left space-y-1 text-xs font-mono">
        <span className="text-[10px] uppercase font-bold text-[#D2C3F6]/60">Destination Path:</span>
        <p className="text-[#F1FEC8] truncate text-[11px]">{outputPath}</p>
      </div>

      {/* Native OS File Action Buttons */}
      <div className="grid grid-cols-3 gap-3 pt-2 relative z-10">
        <button
          onClick={handleOpenFile}
          className="flex items-center justify-center gap-2 py-3 px-3 rounded-2xl bg-gradient-to-r from-[#F1FEC8] to-[#D2C3F6] text-[#16141D] font-bold text-xs shadow-lg shadow-[#F1FEC8]/20 hover:scale-105 transition-all"
        >
          <ArrowSquareOut size={16} weight="bold" />
          <span>Open File</span>
        </button>

        <button
          onClick={handleShowInExplorer}
          className="flex items-center justify-center gap-2 py-3 px-3 rounded-2xl bg-[#36255C] text-[#F1FEC8] border border-[#D2C3F6]/30 font-bold text-xs hover:bg-[#4A3078] hover:scale-105 transition-all"
        >
          <FolderOpen size={16} weight="bold" />
          <span>In Explorer</span>
        </button>

        <button
          onClick={onReset}
          className="flex items-center justify-center gap-2 py-3 px-3 rounded-2xl bg-[#23212C] text-[#D2C3F6] border border-[#D2C3F6]/20 font-bold text-xs hover:bg-[#36255C]/50 hover:text-[#F1FEC8] hover:scale-105 transition-all"
        >
          <ArrowsCounterClockwise size={16} weight="bold" />
          <span>Another File</span>
        </button>
      </div>
    </div>
  );
};
