import React from 'react';
import { motion } from 'framer-motion';
import { CircleNotch, XCircle, Lightning, Timer } from '@phosphor-icons/react';

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
    <div className="w-full max-w-xl mx-auto rounded-3xl liquid-glass border border-[#D2C3F6]/25 p-6 space-y-5 select-none shadow-2xl relative overflow-hidden">
      {/* Header & Status Indicator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#36255C] to-[#4A3078] border border-[#D2C3F6]/30 flex items-center justify-center text-[#F1FEC8]">
            <CircleNotch size={22} className="animate-spin text-[#F1FEC8]" />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#F1FEC8]">
              {phase || 'GPU Upscaling in Progress'}
            </h3>
            <p className="text-xs text-[#D2C3F6]/80 mt-0.5">{statusText}</p>
          </div>
        </div>

        {/* Percentage Display */}
        <div className="text-right">
          <span className="text-2xl font-mono font-black text-[#F1FEC8]">
            {percentage.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Animated SVG Liquid Wave Fill Bar */}
      <div className="w-full h-3 rounded-full bg-[#16141D] border border-[#D2C3F6]/20 overflow-hidden relative">
        <motion.div
          className="h-full bg-gradient-to-r from-[#36255C] via-[#D2C3F6] to-[#F1FEC8] rounded-full relative"
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        >
          {/* Shimmer Ray */}
          <div className="absolute inset-0 bg-white/30 animate-pulse" />
        </motion.div>
      </div>

      {/* Stats Counter Bar (ETA, FPS, GPU mode) */}
      <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-[#23212C]/60 border border-[#D2C3F6]/10 text-xs font-mono text-[#D2C3F6]/80">
        <div className="flex items-center gap-1.5">
          <Timer size={14} className="text-[#F1FEC8]" />
          <span>{formatEta(etaSeconds)}</span>
        </div>
        {fps && fps > 0 && (
          <div className="flex items-center gap-1.5">
            <Lightning size={14} className="text-yellow-300" />
            <span>{fps} FPS</span>
          </div>
        )}
        <span className="text-[10px] text-[#F1FEC8] px-2 py-0.5 rounded-full bg-[#36255C]">
          NCNN Vulkan
        </span>
      </div>

      {/* Cancel Button */}
      <div className="pt-1 flex justify-end">
        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-950/50 hover:bg-red-950/80 text-red-300 border border-red-500/30 text-xs font-bold transition-all hover:scale-105"
        >
          <XCircle size={16} />
          <span>Cancel Upscale</span>
        </button>
      </div>
    </div>
  );
};
