import React from 'react';
import { UploadSimple, FileImage, FileVideo } from '@phosphor-icons/react';

interface DropZoneProps {
  onFileSelect: (files: File[]) => void;
  onBrowseClick: () => void;
  isDragOver: boolean;
  setIsDragOver: (over: boolean) => void;
}

export const DropZone: React.FC<DropZoneProps> = ({
  onFileSelect,
  onBrowseClick,
  isDragOver,
  setIsDragOver,
}) => {
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const fileList = Array.from(e.dataTransfer.files);
      onFileSelect(fileList);
    }
  };

  return (
    <div
      className={`w-full max-w-2xl mx-auto cursor-pointer select-none transition-all duration-200 ${
        isDragOver ? 'scale-[1.01]' : ''
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      onClick={onBrowseClick}
    >
      <div
        className={`rounded-2xl border-2 border-dashed p-12 flex flex-col items-center justify-center space-y-5 text-center transition-colors ${
          isDragOver
            ? 'border-indigo-500 bg-indigo-500/5'
            : 'border-[#272730] hover:border-zinc-600 bg-[#141419]'
        }`}
      >
        {/* Upload Icon Circle */}
        <div className="w-16 h-16 rounded-xl bg-[#181820] border border-[#272730] flex items-center justify-center text-zinc-300 shadow-inner">
          <UploadSimple size={32} weight="bold" className={isDragOver ? 'text-indigo-400' : 'text-zinc-400'} />
        </div>

        {/* Text Details */}
        <div className="space-y-1.5">
          <h3 className="text-base font-semibold text-white tracking-tight">
            Drop images or videos here
          </h3>
          <p className="text-xs text-zinc-400 max-w-xs mx-auto">
            Single file preview or batch multi-file upscaling via Real-ESRGAN NCNN GPU Engine
          </p>
        </div>

        {/* Format Badges */}
        <div className="flex items-center gap-1.5 pt-1">
          <span className="flex items-center gap-1 text-[10px] font-mono font-medium px-2.5 py-1 rounded bg-[#181820] border border-[#272730] text-zinc-400">
            <FileImage size={12} className="text-indigo-400" /> PNG, JPG, WEBP
          </span>
          <span className="flex items-center gap-1 text-[10px] font-mono font-medium px-2.5 py-1 rounded bg-[#181820] border border-[#272730] text-zinc-400">
            <FileVideo size={12} className="text-emerald-400" /> MP4, MKV, MOV
          </span>
        </div>

        {/* Browse Button */}
        <div className="pt-2">
          <button
            type="button"
            className="px-5 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors shadow-sm"
          >
            Browse Files or Batch Folders
          </button>
        </div>
      </div>
    </div>
  );
};
