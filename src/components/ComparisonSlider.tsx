import React, { useState, useRef, useEffect, useCallback } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { MagnifyingGlassPlus, MagnifyingGlassMinus, ArrowsOut, SlidersHorizontal } from '@phosphor-icons/react';

interface ComparisonSliderProps {
  originalPath: string;
  upscaledPath: string;
}

export const ComparisonSlider: React.FC<ComparisonSliderProps> = ({
  originalPath,
  upscaledPath,
}) => {
  const [sliderPos, setSliderPos] = useState(50);
  const [zoomLevel, setZoomLevel] = useState<1 | 2 | 4>(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement | null>(null);
  const isDraggingSlider = useRef(false);
  const isPanning = useRef(false);
  const startPan = useRef({ x: 0, y: 0 });
  const animFrameId = useRef<number | null>(null);

  // 60FPS Hardware Drag Handler via requestAnimationFrame
  const updateSliderPosition = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));

    if (animFrameId.current) cancelAnimationFrame(animFrameId.current);
    animFrameId.current = requestAnimationFrame(() => {
      setSliderPos(percentage);
    });
  }, []);

  const handleMouseDownSlider = (e: React.MouseEvent) => {
    e.stopPropagation();
    isDraggingSlider.current = true;
  };

  const handleMouseDownContainer = (e: React.MouseEvent) => {
    if (zoomLevel > 1) {
      isPanning.current = true;
      startPan.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingSlider.current) {
        updateSliderPosition(e.clientX);
      } else if (isPanning.current) {
        setPan({
          x: e.clientX - startPan.current.x,
          y: e.clientY - startPan.current.y,
        });
      }
    };

    const handleMouseUp = () => {
      isDraggingSlider.current = false;
      isPanning.current = false;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (animFrameId.current) cancelAnimationFrame(animFrameId.current);
    };
  }, [updateSliderPosition, pan.x, pan.y, zoomLevel]);

  const handleZoomToggle = () => {
    if (zoomLevel === 1) setZoomLevel(2);
    else if (zoomLevel === 2) setZoomLevel(4);
    else {
      setZoomLevel(1);
      setPan({ x: 0, y: 0 });
    }
  };

  const resetZoom = () => {
    setZoomLevel(1);
    setPan({ x: 0, y: 0 });
  };

  return (
    <div className="relative w-full max-w-4xl mx-auto flex flex-col gap-3 select-none">
      {/* Header & Zoom Controls Bar */}
      <div className="flex items-center justify-between px-2 text-xs">
        <div className="flex items-center gap-2 font-mono text-[#D2C3F6]/80">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-400" />
          <span>Original (Left) vs Upscaled (Right)</span>
        </div>

        {/* Zoom Lens Pill Controls */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[#23212C]/80 border border-[#D2C3F6]/20 backdrop-blur-md">
          <button
            onClick={handleZoomToggle}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#36255C] text-[#F1FEC8] hover:bg-[#4A3078] transition-colors font-mono font-bold text-[11px]"
            title="Toggle Zoom (1x / 2x / 4x)"
          >
            {zoomLevel === 4 ? (
              <MagnifyingGlassMinus size={14} />
            ) : (
              <MagnifyingGlassPlus size={14} />
            )}
            <span>{zoomLevel}x Zoom</span>
          </button>
          {zoomLevel > 1 && (
            <button
              onClick={resetZoom}
              className="p-1 rounded-lg text-[#D2C3F6]/70 hover:text-[#F1FEC8] hover:bg-[#36255C]/50 transition-colors"
              title="Reset Zoom & Pan"
            >
              <ArrowsOut size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Main Split Slider Viewport */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDownContainer}
        className={`relative aspect-video w-full rounded-3xl overflow-hidden liquid-glass border border-[#D2C3F6]/20 shadow-2xl ${
          zoomLevel > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-ew-resize'
        }`}
      >
        {/* Transform Layer for Zoom & Pan */}
        <div
          className="w-full h-full relative transition-transform duration-150 ease-out"
          style={{
            transform: `scale(${zoomLevel}) translate(${pan.x / zoomLevel}px, ${pan.y / zoomLevel}px)`,
            transformOrigin: 'center center',
          }}
        >
          {/* Base Layer: Original Image */}
          <img
            src={convertFileSrc(originalPath)}
            alt="Original"
            className="absolute inset-0 w-full h-full object-contain pointer-events-none"
          />

          {/* Top Layer: Upscaled Image with clip-path inset */}
          <img
            src={convertFileSrc(upscaledPath || originalPath)}
            alt="Upscaled"
            className="absolute inset-0 w-full h-full object-contain pointer-events-none"
            style={{
              clipPath: `inset(0 0 0 ${sliderPos}%)`,
              willChange: 'clip-path',
            }}
          />
        </div>

        {/* Vertical Glowing Laser Divider Line */}
        <div
          className="absolute top-0 bottom-0 width-[2px] bg-[#D2C3F6] pointer-events-none shadow-[0_0_12px_#D2C3F6,0_0_24px_#36255C] z-20"
          style={{ left: `${sliderPos}%` }}
        />

        {/* Liquid Glass Center Handle Pill */}
        <div
          onMouseDown={handleMouseDownSlider}
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-[#23212C]/90 border-2 border-[#D2C3F6] text-[#F1FEC8] flex items-center justify-center shadow-2xl shadow-[#36255C]/80 cursor-ew-resize hover:scale-110 active:scale-125 transition-transform z-30"
          style={{ left: `${sliderPos}%` }}
        >
          <SlidersHorizontal size={18} className="rotate-90 text-[#F1FEC8]" />
        </div>
      </div>
    </div>
  );
};
