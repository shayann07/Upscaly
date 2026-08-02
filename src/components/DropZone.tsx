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
          <div className="atropos-inner rounded-3xl liquid-glass border border-[#D2C3F6]/30 p-10 flex flex-col items-center justify-center space-y-6 text-center relative overflow-hidden shadow-2xl backdrop-blur-2xl">
            {/* Background Ambient Glow */}
            <div className="absolute -inset-2 bg-gradient-to-tr from-[#7C3AED]/30 via-[#EC4899]/20 to-[#3B82F6]/30 rounded-3xl blur-2xl opacity-70 pointer-events-none" />

            {/* Parallax Icon Layer (Offset 30) */}
            <div
              data-atropos-offset="30"
              className="w-22 h-22 rounded-3xl bg-gradient-to-tr from-[#36255C] via-[#4A3078] to-[#5E3C98] border border-[#F1FEC8]/40 flex items-center justify-center shadow-2xl shadow-[#7C3AED]/50 relative z-10"
            >
              <UploadSimple size={42} weight="duotone" className="text-[#F1FEC8] animate-bounce" />
            </div>

            {/* Parallax Text Layer (Offset 15) */}
            <div data-atropos-offset="15" className="space-y-2 relative z-10">
              <h3 className="text-lg font-extrabold tracking-wide text-[#F1FEC8] drop-shadow-md">
                Drag & Drop Image or Video Here
              </h3>
              <p className="text-xs text-[#D2C3F6]/90 max-w-sm mx-auto font-medium">
                Upscale photos and video clips natively with Vulkan AI acceleration
              </p>
            </div>

            {/* Floating Format Badges (Offset 25 for 3D Depth) */}
            <div data-atropos-offset="25" className="flex items-center gap-2 relative z-10">
              {['PNG', 'JPG', 'WEBP', 'MP4', 'MKV'].map((fmt) => (
                <span
                  key={fmt}
                  className="text-[10px] font-mono font-bold px-3 py-1 rounded-full bg-[#23212C]/90 border border-[#D2C3F6]/30 text-[#D2C3F6] shadow-md hover:border-[#F1FEC8]/50 hover:text-[#F1FEC8] transition-colors"
                >
                  {fmt}
                </span>
              ))}
            </div>

            {/* Browse Button (Offset 10) */}
            <div data-atropos-offset="10" className="relative z-10 pt-2">
              <button
                type="button"
                className="px-7 py-3 text-xs font-extrabold rounded-2xl bg-gradient-to-r from-[#36255C] via-[#4A3078] to-[#5E3C98] text-[#F1FEC8] border border-[#F1FEC8]/40 shadow-xl shadow-[#7C3AED]/40 transition-all hover:scale-108 active:scale-95 flex items-center gap-2"
              >
                <Sparkle size={14} weight="fill" className="text-[#F1FEC8]" />
                <span>Browse Files</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
