import React from 'react';
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
    <div className="w-full rounded-xl bg-[#141419] border border-[#272730] px-4 py-2.5 flex items-center justify-between select-none shadow-lg shrink-0">
      {/* Left: Media Icon & Filename */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="w-8 h-8 rounded-lg bg-[#181820] border border-[#272730] flex items-center justify-center text-indigo-400 shrink-0">
          {isVideo ? <VideoIcon size={18} /> : <ImageIcon size={18} />}
        </div>
        <div className="min-w-0 flex-1 pr-4">
          <p className="text-xs font-semibold text-white truncate">{fileName}</p>
          <p className="text-[10px] text-zinc-400 font-mono font-medium uppercase">
            {formatSize(fileSize)} &bull; {isVideo ? 'Video' : 'Image'}
          </p>
        </div>
      </div>

      {/* Center: Target Scale Badge */}
      <div className="flex items-center gap-1.5 font-mono font-medium text-xs text-white bg-[#181820] border border-[#272730] px-3 py-1 rounded-lg">
        <span className="text-zinc-500 text-[10px]">Source</span>
        <ArrowRight size={12} className="text-zinc-500" />
        <span className="px-2 py-0.5 rounded bg-indigo-600/20 text-indigo-300 text-[10px] border border-indigo-500/30 flex items-center gap-1">
          <Sparkle size={10} weight="fill" className="text-indigo-400" />
          {scale}x AI Enhanced
        </span>
      </div>

      {/* Right: Quick Remove Button */}
      <button
        type="button"
        onClick={onRemove}
        className="ml-4 p-1.5 rounded-lg bg-[#181820] text-zinc-400 hover:text-red-400 hover:bg-red-950/30 border border-[#272730] transition-colors shrink-0 cursor-pointer"
        title="Remove File"
      >
        <X size={14} weight="bold" />
      </button>
    </div>
  );
};
