import React, { useState } from 'react';
import { Sparkle, DownloadSimple, X } from '@phosphor-icons/react';

interface UpdateBadgeProps {
  latestVersion: string;
  releaseNotes?: string;
  onDownload: () => void;
  isDownloading: boolean;
  downloadPercentage: number;
}

export const UpdateBadge: React.FC<UpdateBadgeProps> = ({
  latestVersion,
  releaseNotes = 'Real-ESRGAN v0.3.0 release with enhanced Vulkan FP16 acceleration and lower memory consumption.',
  onDownload,
  isDownloading,
  downloadPercentage,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Glowing Pill Badge */}
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#36255C] border border-[#F1FEC8]/40 text-[#F1FEC8] text-[11px] font-bold shadow-lg shadow-[#F1FEC8]/10 hover:scale-105 transition-all cursor-pointer animate-pulse"
      >
        <span className="w-2 h-2 rounded-full bg-[#F1FEC8]" />
        <span>Update Available {latestVersion}</span>
      </button>

      {/* Release Notes Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-6 select-none">
          <div className="w-full max-w-md liquid-glass border border-[#F1FEC8]/30 rounded-3xl p-6 space-y-5 shadow-2xl relative">
            <button
              onClick={() => setIsOpen(false)}
              className="absolute top-4 right-4 text-[#D2C3F6]/60 hover:text-[#F1FEC8] transition-colors"
            >
              <X size={18} />
            </button>

            {/* Modal Icon & Title */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#36255C] to-[#4A3078] border border-[#F1FEC8]/40 flex items-center justify-center text-[#F1FEC8]">
                <Sparkle size={22} weight="fill" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#F1FEC8]">New Model Release Available</h3>
                <p className="text-xs text-[#D2C3F6]/70">Version {latestVersion}</p>
              </div>
            </div>

            {/* Release Notes */}
            <div className="p-3 rounded-2xl bg-[#23212C]/80 border border-[#D2C3F6]/15 text-xs text-[#D2C3F6]/90 space-y-1">
              <span className="text-[10px] uppercase font-bold text-[#F1FEC8]">
                Release Highlights:
              </span>
              <p className="leading-relaxed">{releaseNotes}</p>
            </div>

            {/* Download Progress Bar or Action CTA */}
            {isDownloading ? (
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-mono font-bold text-[#F1FEC8]">
                  <span>Downloading Model Weights...</span>
                  <span>{downloadPercentage.toFixed(1)}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-[#16141D] overflow-hidden border border-[#D2C3F6]/20">
                  <div
                    className="h-full bg-gradient-to-r from-[#36255C] to-[#F1FEC8] transition-all duration-150"
                    style={{ width: `${downloadPercentage}%` }}
                  />
                </div>
              </div>
            ) : (
              <button
                onClick={onDownload}
                className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-[#F1FEC8] to-[#D2C3F6] text-[#16141D] font-bold text-xs shadow-lg shadow-[#F1FEC8]/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                <DownloadSimple size={16} weight="bold" />
                <span>Download & Install Model</span>
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
};
