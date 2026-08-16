import React from 'react';
import { CircleNotch, XCircle, Lightning, Timer, Sparkle } from '@phosphor-icons/react';

interface ProgressOverlayProps {
  percentage: number;
  statusText: string;
  phase: string;
  fps?: number;
  etaSeconds?: number;
  onCancel: () => void;
}

export const ProgressOverlay: React.FC<ProgressOverlayProps> = ({
  percentage,
  statusText,
  phase,
  fps,
  etaSeconds,
  onCancel,
}) => {
  const formatEta = (seconds?: number) => {
    if (!seconds || seconds <= 0) return 'Calculating...';
    if (seconds < 60) return `~${seconds}s left`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `~${mins}m ${secs}s left`;
  };

  return (
    <div className="w-full max-w-lg rounded-2xl bg-[#141419]/90 border border-[#272730] p-5 space-y-4 select-none shadow-2xl backdrop-blur-xl">
      {/* Header & Status Indicator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <CircleNotch size={22} className="animate-spin" />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
              <Sparkle size={12} weight="fill" className="text-indigo-400" />
              {phase || 'GPU Upscaling in Progress'}
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5 font-medium">{statusText}</p>
          </div>
        </div>

        {/* Percentage Display */}
        <div className="text-right">
          <span className="text-2xl font-mono font-extrabold text-white tracking-tight">
            {percentage.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-2.5 rounded-full bg-[#181820] border border-[#272730] overflow-hidden relative">
        <div
          className="h-full bg-gradient-to-r from-indigo-600 to-indigo-400 rounded-full transition-all duration-300 ease-out shadow-[0_0_12px_rgba(91,91,214,0.6)]"
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Stats Counter Bar (ETA, FPS, GPU mode) */}
      <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-[#181820]/80 border border-[#272730] text-xs font-mono text-zinc-300">
        <div className="flex items-center gap-1.5">
          <Timer size={14} className="text-indigo-400" />
          <span>{formatEta(etaSeconds)}</span>
        </div>
        {fps && fps > 0 && (
          <div className="flex items-center gap-1.5">
            <Lightning size={14} className="text-amber-400" />
            <span>{fps} FPS</span>
          </div>
        )}
        <span className="text-[10px] font-sans font-semibold text-indigo-300 px-2.5 py-0.5 rounded-md bg-indigo-950/50 border border-indigo-500/30">
          Vulkan GPU Accelerated
        </span>
      </div>

      {/* Cancel Button */}
      <div className="pt-1 flex justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-red-950/40 hover:bg-red-950/80 text-red-300 border border-red-500/30 text-xs font-semibold transition-colors cursor-pointer"
        >
          <XCircle size={15} />
          <span>Cancel Upscale</span>
        </button>
      </div>
    </div>
  );
};
