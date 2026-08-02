import React from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { X, Image as ImageIcon, Video as VideoIcon, ArrowRight } from '@phosphor-icons/react';

interface FilePreviewProps {
  filePath: string;
  fileName: string;
  fileSize: number;
  isVideo: boolean;
  scale: number;
  onRemove: () => void;
}

export const FilePreview: React.FC<FilePreviewProps> = ({
  filePath,
  fileName,
  fileSize,
  isVideo,
  scale,
  onRemove,
}) => {
  const formatSize = (bytes: number) => {
    if (bytes === 0) return 'Local File';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(2)} MB`;
  };

  return (
    <div className="relative rounded-2xl liquid-glass-card border border-[#D2C3F6]/20 p-4 space-y-4 select-none">
      {/* Quick Remove Button */}
      <button
        onClick={onRemove}
        className="absolute top-3 right-3 p-1.5 rounded-full bg-[#23212C]/80 text-[#D2C3F6]/60 hover:text-red-400 hover:bg-red-950/40 border border-[#D2C3F6]/10 transition-colors z-10"
        title="Remove File"
      >
        <X size={14} weight="bold" />
      </button>

      {/* Media Info Strip */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-[#36255C] to-[#23212C] border border-[#D2C3F6]/20 flex items-center justify-center text-[#F1FEC8] shadow-md">
          {isVideo ? <VideoIcon size={24} weight="duotone" /> : <ImageIcon size={24} weight="duotone" />}
        </div>
        <div className="flex-1 min-w-0 pr-6">
          <p className="text-xs font-bold text-[#F1FEC8] truncate">{fileName}</p>
          <p className="text-[10px] text-[#D2C3F6]/70 font-mono mt-0.5">
            {formatSize(fileSize)} &bull; {isVideo ? 'Video Clip' : 'Static Image'}
          </p>
        </div>
      </div>

      {/* Target Resolution Calculation Pill */}
      <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#23212C]/60 border border-[#D2C3F6]/10 text-xs">
        <span className="text-[#D2C3F6]/70 text-[11px]">Upscale Scale:</span>
        <div className="flex items-center gap-2 font-mono font-bold text-[#F1FEC8]">
          <span>Original</span>
          <ArrowRight size={12} className="text-[#D2C3F6]" />
          <span className="px-2 py-0.5 rounded-full bg-[#36255C] text-[#F1FEC8] text-[10px] border border-[#D2C3F6]/30">
            {scale}x Resolution
          </span>
        </div>
      </div>

      {/* Media Thumbnail Container */}
      {!isVideo && (
        <div className="relative aspect-video w-full rounded-xl overflow-hidden border border-[#D2C3F6]/15 bg-black/40">
          <img
            src={convertFileSrc(filePath)}
            alt={fileName}
            className="w-full h-full object-contain"
          />
        </div>
      )}
    </div>
  );
};
