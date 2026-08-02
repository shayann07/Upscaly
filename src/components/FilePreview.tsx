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
    <div className="relative rounded-3xl bg-[#16141D]/40 border border-white/5 p-5 space-y-4 select-none shadow-[0_8px_32px_rgba(0,0,0,0.4)] backdrop-blur-3xl overflow-hidden group">
      {/* Ambient Inner Sheen */}
      <div className="absolute -top-10 -right-10 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl pointer-events-none transition-opacity opacity-50 group-hover:opacity-100" />

      {/* Quick Remove Button */}
      <button
        type="button"
        onClick={onRemove}
        className="absolute top-4 right-4 p-2 rounded-xl bg-black/40 text-white/50 hover:text-rose-400 hover:bg-rose-500/20 border border-white/5 hover:border-rose-500/30 transition-all z-10 cursor-pointer active:scale-95 shadow-sm"
        title="Remove File"
      >
        <X size={15} weight="bold" />
      </button>

      {/* Media Info Strip */}
      <div className="flex items-center gap-3.5 relative z-10">
        <div className="w-14 h-14 rounded-2xl bg-black/40 border border-white/10 flex items-center justify-center text-emerald-400 shadow-inner shrink-0 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-tr from-purple-500/10 to-emerald-500/10" />
          {isVideo ? <VideoIcon size={26} weight="duotone" className="relative z-10" /> : <ImageIcon size={26} weight="duotone" className="relative z-10" />}
        </div>
        <div className="flex-1 min-w-0 pr-10">
          <p className="text-sm font-bold text-white truncate drop-shadow-md">{fileName}</p>
          <p className="text-[10px] text-white/50 font-mono mt-1 font-semibold uppercase tracking-wider">
            {formatSize(fileSize)} &bull; {isVideo ? 'Video' : 'Image'}
          </p>
        </div>
      </div>

      {/* Target Resolution Calculation Pill */}
      <div className="flex items-center justify-between px-4 py-3 rounded-2xl bg-black/40 border border-white/5 text-xs relative z-10 shadow-inner">
        <span className="text-white/50 text-[10px] font-bold uppercase tracking-widest">Target Resolution</span>
        <div className="flex items-center gap-2 font-mono font-bold text-white">
          <span className="text-white/40 text-[10px]">Source</span>
          <ArrowRight size={12} className="text-white/30" />
          <span className="px-3 py-1 rounded-full bg-gradient-to-r from-purple-500/20 to-emerald-500/20 text-white text-[10px] border border-white/10 flex items-center gap-1 shadow-[0_0_10px_rgba(255,255,255,0.05)]">
            <Sparkle size={10} weight="fill" className="text-emerald-400" />
            {scale}x AI Enhanced
          </span>
        </div>
      </div>

      {/* Media Thumbnail Container */}
      {!isVideo && (
        <div className="relative aspect-video w-full rounded-2xl overflow-hidden border border-white/10 bg-black/60 shadow-inner relative z-10 flex items-center justify-center">
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
