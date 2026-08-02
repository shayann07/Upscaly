import React from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { X, Image as ImageIcon, Video as VideoIcon, ArrowRight, Sparkle } from '@phosphor-icons/react';

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
    <div className="relative rounded-3xl liquid-glass border border-[#D2C3F6]/25 p-5 space-y-4 select-none shadow-2xl backdrop-blur-2xl overflow-hidden">
      {/* Ambient Inner Sheen */}
      <div className="absolute -top-10 -right-10 w-32 h-32 bg-[#F1FEC8]/10 rounded-full blur-xl pointer-events-none" />

      {/* Quick Remove Button */}
      <button
        type="button"
        onClick={onRemove}
        className="absolute top-4 right-4 p-2 rounded-xl bg-[#23212C]/80 text-[#D2C3F6]/70 hover:text-rose-400 hover:bg-rose-950/60 border border-[#D2C3F6]/20 transition-all z-10 cursor-pointer active:scale-90"
        title="Remove File"
      >
        <X size={15} weight="bold" />
      </button>

      {/* Media Info Strip */}
      <div className="flex items-center gap-3.5 relative z-10">
        <div className="w-13 h-13 rounded-2xl bg-gradient-to-tr from-[#36255C] via-[#4A3078] to-[#5E3C98] border border-[#F1FEC8]/30 flex items-center justify-center text-[#F1FEC8] shadow-lg shadow-[#36255C]/50 shrink-0">
          {isVideo ? <VideoIcon size={26} weight="duotone" /> : <ImageIcon size={26} weight="duotone" />}
        </div>
        <div className="flex-1 min-w-0 pr-8">
          <p className="text-xs font-extrabold text-[#F1FEC8] truncate drop-shadow-sm">{fileName}</p>
          <p className="text-[10px] text-[#D2C3F6]/80 font-mono mt-0.5 font-semibold">
            {formatSize(fileSize)} &bull; {isVideo ? 'Video File' : 'Image File'}
          </p>
        </div>
      </div>

      {/* Target Resolution Calculation Pill */}
      <div className="flex items-center justify-between px-4 py-2.5 rounded-2xl bg-[#16141D]/80 border border-[#D2C3F6]/15 text-xs relative z-10 shadow-inner">
        <span className="text-[#D2C3F6]/80 text-[11px] font-bold uppercase tracking-wider">Target Resolution</span>
        <div className="flex items-center gap-2 font-mono font-bold text-[#F1FEC8]">
          <span>Source</span>
          <ArrowRight size={14} className="text-[#D2C3F6]" />
          <span className="px-3 py-1 rounded-full bg-gradient-to-r from-[#36255C] to-[#4A3078] text-[#F1FEC8] text-[10px] border border-[#D2C3F6]/40 flex items-center gap-1 shadow">
            <Sparkle size={10} weight="fill" className="text-[#F1FEC8]" />
            {scale}x AI Enhanced
          </span>
        </div>
      </div>

      {/* Media Thumbnail Container */}
      {!isVideo && (
        <div className="relative aspect-video w-full rounded-2xl overflow-hidden border border-[#D2C3F6]/20 bg-[#121018] shadow-inner relative z-10">
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
