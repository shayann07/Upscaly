import React, { useEffect, useRef } from 'react';
import Atropos from 'atropos';
import { UploadSimple, Sparkle } from '@phosphor-icons/react';

interface DropZoneProps {
  onFileSelect: (file: File) => void;
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
  const atroposRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!atroposRef.current) return;

    const instance = Atropos({
      el: atroposRef.current,
      activeOffset: 40,
      shadowScale: 1.05,
      highlight: true,
      rotateTouch: false,
    });

    return () => {
      instance.destroy();
    };
  }, []);

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFileSelect(e.dataTransfer.files[0]);
    }
  };

  return (
    <div
      ref={atroposRef}
      className={`atropos my-atropos w-full cursor-pointer select-none transition-all duration-300 ${
        isDragOver ? 'scale-[1.03]' : ''
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      onClick={onBrowseClick}
    >
      <div className="atropos-scale">
        <div className="atropos-rotate">
          <div className="atropos-inner rounded-3xl bg-[#16141D]/40 border border-white/5 p-10 flex flex-col items-center justify-center space-y-6 text-center relative overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-3xl">
            {/* Background Ambient Glow */}
            <div className="absolute -inset-2 bg-gradient-to-tr from-purple-600/10 via-transparent to-emerald-500/10 rounded-3xl blur-2xl opacity-70 pointer-events-none" />

            {/* Parallax Icon Layer */}
            <div
              data-atropos-offset="30"
              className="w-24 h-24 rounded-3xl bg-black/40 border border-white/10 flex items-center justify-center shadow-2xl relative z-10 overflow-hidden group"
            >
              <div className="absolute inset-0 bg-gradient-to-tr from-purple-500/20 to-emerald-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <UploadSimple size={48} weight="duotone" className="text-emerald-400 group-hover:text-emerald-300 transition-colors group-hover:scale-110 duration-500" />
            </div>

            {/* Parallax Text Layer */}
            <div data-atropos-offset="15" className="space-y-3 relative z-10">
              <h3 className="text-xl font-extrabold tracking-wide text-white drop-shadow-md">
                Drag & Drop Media Here
              </h3>
              <p className="text-xs text-white/50 max-w-sm mx-auto font-medium">
                Upscale photos and videos natively with blazing fast Vulkan acceleration.
              </p>
            </div>

            {/* Floating Format Badges */}
            <div data-atropos-offset="25" className="flex items-center gap-2 relative z-10 pt-2">
              {['PNG', 'JPG', 'WEBP', 'MP4', 'MKV'].map((fmt) => (
                <span
                  key={fmt}
                  className="text-[10px] font-mono font-bold px-3 py-1.5 rounded-full bg-black/40 border border-white/5 text-white/50 shadow-md hover:border-white/20 hover:text-white transition-colors"
                >
                  {fmt}
                </span>
              ))}
            </div>

            {/* Browse Button */}
            <div data-atropos-offset="10" className="relative z-10 pt-4">
              <button
                type="button"
                className="px-8 py-3.5 text-xs font-bold uppercase tracking-widest rounded-xl bg-white/5 hover:bg-white/10 text-white border border-white/10 shadow-xl transition-all hover:shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:scale-105 active:scale-95 flex items-center gap-2"
              >
                <Sparkle size={16} weight="fill" className="text-emerald-400" />
                <span>Browse Files</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
