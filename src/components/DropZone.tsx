import React, { useEffect, useRef } from 'react';
import Atropos from 'atropos';
import { UploadSimple } from '@phosphor-icons/react';

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
        isDragOver ? 'scale-[1.02]' : ''
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
          <div className="atropos-inner rounded-3xl liquid-glass border border-[#D2C3F6]/20 p-8 flex flex-col items-center justify-center space-y-6 text-center relative overflow-hidden shadow-2xl">
            {/* Background Ambient Glow */}
            <div className="absolute -inset-1 bg-gradient-to-r from-[#36255C]/40 to-[#D2C3F6]/20 rounded-3xl blur-xl opacity-50" />

            {/* Parallax Icon Layer (Offset 30) */}
            <div
              data-atropos-offset="30"
              className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-[#36255C] to-[#23212C] border border-[#D2C3F6]/30 flex items-center justify-center shadow-lg shadow-[#36255C]/50 relative z-10"
            >
              <UploadSimple size={36} weight="duotone" className="text-[#F1FEC8] animate-bounce" />
            </div>

            {/* Parallax Text Layer (Offset 15) */}
            <div data-atropos-offset="15" className="space-y-2 relative z-10">
              <h3 className="text-base font-bold tracking-wide text-[#F1FEC8]">
                Drag & Drop Image or Video Here
              </h3>
              <p className="text-xs text-[#D2C3F6]/70 max-w-xs mx-auto">
                Upscale photos and video clips natively with Vulkan AI acceleration
              </p>
            </div>

            {/* Floating Format Badges (Offset 25 for 3D Depth) */}
            <div data-atropos-offset="25" className="flex items-center gap-2 relative z-10">
              {['PNG', 'JPG', 'WEBP', 'MP4', 'MKV'].map((fmt) => (
                <span
                  key={fmt}
                  className="text-[10px] font-mono font-semibold px-2.5 py-1 rounded-full bg-[#23212C]/80 border border-[#D2C3F6]/20 text-[#D2C3F6] shadow-sm"
                >
                  {fmt}
                </span>
              ))}
            </div>

            {/* Browse Button (Offset 10) */}
            <div data-atropos-offset="10" className="relative z-10 pt-2">
              <button
                type="button"
                className="px-5 py-2.5 text-xs font-bold rounded-full bg-gradient-to-r from-[#36255C] to-[#4A3078] hover:from-[#4A3078] hover:to-[#5E3C98] text-[#F1FEC8] border border-[#D2C3F6]/30 shadow-lg shadow-[#36255C]/40 transition-all hover:scale-105"
              >
                Browse Files
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
