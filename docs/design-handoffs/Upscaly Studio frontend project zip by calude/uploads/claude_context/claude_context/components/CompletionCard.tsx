import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { openPath, revealItemInDir } from '@tauri-apps/plugin-opener';
import { FolderOpen, ArrowSquareOut, ArrowsCounterClockwise, CheckCircle, Copy, Check } from '@phosphor-icons/react';

interface CompletionCardProps {
  outputPath: string;
  onReset: () => void;
}

export const CompletionCard: React.FC<CompletionCardProps> = ({ outputPath, onReset }) => {
  const [copied, setCopied] = useState(false);

  const handleOpenFile = async () => {
    try {
      await invoke('open_file_native', { path: outputPath });
    } catch (err) {
      console.warn('Native open_file failed, falling back to plugin-opener:', err);
      try {
        await openPath(outputPath);
      } catch (err2) {
        console.error('Failed to open file:', err2);
      }
    }
  };

  const handleShowInExplorer = async () => {
    try {
      await invoke('show_in_explorer_native', { path: outputPath });
    } catch (err) {
      console.warn('Native show_in_explorer failed, falling back to plugin-opener:', err);
      try {
        await revealItemInDir(outputPath);
      } catch (err2) {
        console.error('Failed to reveal in explorer:', err2);
      }
    }
  };

  const handleCopyPath = async () => {
    try {
      await navigator.clipboard.writeText(outputPath);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error('Failed to copy path to clipboard:', err);
    }
  };

  return (
    <div className="w-full max-w-lg mx-auto rounded-xl bg-[#141419]/95 backdrop-blur-xl border border-[#272730] p-3.5 space-y-2.5 shadow-2xl text-center select-none">
      {/* Icon & Status Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shadow-sm">
            <CheckCircle size={16} weight="fill" />
          </div>
          <span className="text-xs font-bold text-white tracking-tight">
            Upscaling Successfully Completed!
          </span>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#181820] text-zinc-300 border border-[#272730] hover:bg-[#22222B] hover:text-white font-medium text-xs transition-all shadow-sm cursor-pointer active:scale-95"
        >
          <ArrowsCounterClockwise size={13} weight="bold" />
          <span>New File</span>
        </button>
      </div>

      {/* Destination Path Bar */}
      <div className="p-2 rounded-lg bg-[#181820] border border-[#272730] flex items-center justify-between gap-2 font-mono text-[11px]">
        <span className="text-zinc-300 font-mono truncate select-text cursor-text max-w-[280px]" title={outputPath}>
          {outputPath}
        </span>
        <button
          type="button"
          onClick={handleCopyPath}
          className="flex items-center gap-1 text-[11px] font-sans font-medium text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer shrink-0"
        >
          {copied ? (
            <>
              <Check size={12} className="text-emerald-400" weight="bold" />
              <span className="text-emerald-400 font-semibold">Copied</span>
            </>
          ) : (
            <>
              <Copy size={12} />
              <span>Copy Path</span>
            </>
          )}
        </button>
      </div>

      {/* Primary Action Buttons */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleOpenFile}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-all shadow-md cursor-pointer active:scale-95"
        >
          <ArrowSquareOut size={15} weight="bold" />
          <span>Open File</span>
        </button>

        <button
          type="button"
          onClick={handleShowInExplorer}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-[#181820] text-zinc-300 border border-[#272730] hover:bg-[#22222B] hover:text-white font-medium text-xs transition-all shadow-sm cursor-pointer active:scale-95"
        >
          <FolderOpen size={15} weight="bold" />
          <span>In Explorer</span>
        </button>
      </div>
    </div>
  );
};
