import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { getMediaSrc } from '../lib/media';
import { MagnifyingGlassPlus, MagnifyingGlassMinus, ArrowsOut, SlidersHorizontal, Sparkle, Eye, Columns, CirclesThreePlus } from '@phosphor-icons/react';

interface ComparisonSliderProps {
  originalPath: string;
  upscaledPath: string;
  viewMode?: 'split' | 'side-by-side';
  onToggleViewMode?: () => void;
  isHoldingOriginal?: boolean;
}

export const ComparisonSlider: React.FC<ComparisonSliderProps> = ({
  originalPath,
  upscaledPath,
  viewMode = 'split',
  onToggleViewMode,
  isHoldingOriginal = false,
}) => {
  const [zoomLevel, setZoomLevel] = useState<1 | 2 | 4>(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [showOriginalOverride, setShowOriginalOverride] = useState(false);
  const [isLoupeActive, setIsLoupeActive] = useState(false);
  const [loupePos, setLoupePos] = useState<{ x: number; y: number; pctX: number; pctY: number } | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const topImgRef = useRef<HTMLImageElement | null>(null);
  const lineRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<HTMLDivElement | null>(null);

  const isDraggingSlider = useRef(false);
  const isPanning = useRef(false);
  const startPan = useRef({ x: 0, y: 0 });

  const isShowingOriginal = isHoldingOriginal || showOriginalOverride;

  // Direct DOM updates for ultra-smooth 60fps dragging with 0 React re-renders & 0 memory leaks
  const updateSliderPosition = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));

    if (topImgRef.current) {
      topImgRef.current.style.clipPath = `inset(0 0 0 ${pct}%)`;
    }
    if (lineRef.current) {
      lineRef.current.style.left = `${pct}%`;
    }
    if (handleRef.current) {
      handleRef.current.style.left = `${pct}%`;
    }
  }, []);

  const handleMouseDownSlider = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isDraggingSlider.current = true;
  };

  const handleMouseDownContainer = (e: React.MouseEvent) => {
    if (zoomLevel > 1) {
      isPanning.current = true;
      startPan.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    }
  };

  const handleMouseMoveContainer = (e: React.MouseEvent) => {
    if (isLoupeActive && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const pctX = (x / rect.width) * 100;
      const pctY = (y / rect.height) * 100;
      setLoupePos({ x, y, pctX, pctY });
    }
  };

  const handleMouseLeaveContainer = () => {
    if (isLoupeActive) {
      setLoupePos(null);
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

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
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

  // Stable image source URLs memoized per file path to prevent image re-decodes
  const originalSrc = useMemo(() => getMediaSrc(originalPath), [originalPath]);
  const upscaledSrc = useMemo(() => {
    if (!upscaledPath) return originalSrc;
    return `${getMediaSrc(upscaledPath)}?t=${encodeURIComponent(upscaledPath)}`;
  }, [upscaledPath, originalSrc]);

  return (
    <div className="relative w-full h-full flex flex-col gap-2 select-none p-2">
      {/* Header Controls Toolbar */}
      <div className="flex items-center justify-between px-2 text-xs">
        <div className="flex items-center gap-3 font-mono text-zinc-400">
          <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
          <span>
            {viewMode === 'split'
              ? 'Drag slider or hold Space to compare'
              : 'Side-by-Side Dual Viewport'}
          </span>
        </div>

        {/* Studio Canvas Control Pills */}
        <div className="flex items-center gap-2">
          {/* View Mode Toggle Pill */}
          {onToggleViewMode && (
            <button
              type="button"
              onClick={onToggleViewMode}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#181820] text-zinc-300 border border-[#272730] hover:bg-[#22222B] hover:text-white transition-colors text-[11px] font-medium cursor-pointer"
              title="Toggle View Mode (S)"
            >
              <Columns size={14} className="text-indigo-400" />
              <span className="capitalize">{viewMode} Mode</span>
            </button>
          )}

          {/* Hold Original Pill */}
          <button
            type="button"
            onMouseDown={() => setShowOriginalOverride(true)}
            onMouseUp={() => setShowOriginalOverride(false)}
            onMouseLeave={() => setShowOriginalOverride(false)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-colors cursor-pointer ${
              isShowingOriginal
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                : 'bg-[#181820] text-zinc-300 border-[#272730] hover:bg-[#22222B]'
            }`}
            title="Press or Hold Space to view Original"
          >
            <Eye size={14} className={isShowingOriginal ? 'text-amber-400' : 'text-zinc-400'} />
            <span>Hold Space (Original)</span>
          </button>

          {/* 1:1 Loupe Lens Toggle Pill */}
          <button
            type="button"
            onClick={() => setIsLoupeActive(!isLoupeActive)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-colors cursor-pointer ${
              isLoupeActive
                ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/40'
                : 'bg-[#181820] text-zinc-300 border-[#272730] hover:bg-[#22222B]'
            }`}
            title="Toggle 1:1 Pixel Inspection Loupe"
          >
            <CirclesThreePlus size={14} className={isLoupeActive ? 'text-indigo-400' : 'text-zinc-400'} />
            <span>1:1 Loupe</span>
          </button>

          {/* Zoom Controls Pill */}
          <div className="flex items-center gap-1.5 p-1 rounded-lg bg-[#181820] border border-[#272730]">
            <button
              type="button"
              onClick={handleZoomToggle}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-600/30 transition-colors font-mono font-medium text-[11px] cursor-pointer"
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
                type="button"
                onClick={resetZoom}
                className="p-1 rounded text-zinc-400 hover:text-white hover:bg-[#22222B] transition-colors cursor-pointer"
                title="Reset Zoom & Pan"
              >
                <ArrowsOut size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Canvas Viewport */}
      {viewMode === 'side-by-side' ? (
        /* SIDE-BY-SIDE DUAL VIEWPORT MODE */
        <div className="flex-1 w-full grid grid-cols-2 gap-2 rounded-2xl overflow-hidden">
          {/* Left: Original */}
          <div className="relative w-full h-full bg-[#0F0F12] border border-[#272730] rounded-xl overflow-hidden flex items-center justify-center p-2">
            <div className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-black/70 backdrop-blur-md border border-white/10 text-[10px] font-mono font-semibold text-zinc-300 z-30 shadow-lg">
              BEFORE &bull; ORIGINAL
            </div>
            <img
              src={originalSrc}
              alt="Original"
              className="max-h-full max-w-full object-contain"
            />
          </div>

          {/* Right: AI Enhanced */}
          <div className="relative w-full h-full bg-[#0F0F12] border border-[#272730] rounded-xl overflow-hidden flex items-center justify-center p-2">
            <div className="absolute top-3 right-3 px-2.5 py-1 rounded-lg bg-indigo-600/90 backdrop-blur-md border border-indigo-400/40 text-[10px] font-mono font-bold text-white z-30 shadow-lg flex items-center gap-1">
              <Sparkle size={12} weight="fill" className="text-indigo-200" />
              AFTER &bull; AI ENHANCED
            </div>
            <img
              src={upscaledSrc}
              alt="Upscaled"
              className="max-h-full max-w-full object-contain"
            />
          </div>
        </div>
      ) : (
        /* SPLIT DIVIDER VIEWPORT MODE */
        <div
          ref={containerRef}
          onMouseDown={handleMouseDownContainer}
          onMouseMove={handleMouseMoveContainer}
          onMouseLeave={handleMouseLeaveContainer}
          className={`relative flex-1 w-full rounded-2xl overflow-hidden bg-[#0F0F12] border border-[#272730] shadow-2xl ${
            zoomLevel > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-ew-resize'
          }`}
        >
          {/* Visual Badges */}
          <div className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-black/70 backdrop-blur-md border border-white/10 text-[10px] font-mono font-semibold text-zinc-300 z-30 pointer-events-none shadow-lg">
            BEFORE &bull; ORIGINAL
          </div>

          <div className="absolute top-3 right-3 px-2.5 py-1 rounded-lg bg-indigo-600/90 backdrop-blur-md border border-indigo-400/40 text-[10px] font-mono font-bold text-white z-30 pointer-events-none shadow-lg flex items-center gap-1">
            <Sparkle size={12} weight="fill" className="text-indigo-200" />
            AFTER &bull; AI ENHANCED
          </div>

          {/* Transform Canvas Layer */}
          <div
            className="w-full h-full relative"
            style={{
              transform: `scale(${zoomLevel}) translate(${pan.x / zoomLevel}px, ${pan.y / zoomLevel}px)`,
              transformOrigin: 'center center',
            }}
          >
            {/* Base Layer: Original Image (Left Side) */}
            <img
              src={originalSrc}
              alt="Original"
              className="absolute inset-0 w-full h-full object-contain pointer-events-none"
            />

            {/* Top Layer: Upscaled Image with clip-path inset (Right Side) */}
            {!isShowingOriginal && (
              <img
                ref={topImgRef}
                src={upscaledSrc}
                alt="Upscaled"
                className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                style={{
                  clipPath: 'inset(0 0 0 50%)',
                  willChange: 'clip-path',
                }}
              />
            )}
          </div>

          {/* Vertical Divider Line */}
          {!isShowingOriginal && (
            <div
              ref={lineRef}
              className="absolute top-0 bottom-0 w-[2px] bg-white pointer-events-none z-30 shadow-[0_0_8px_rgba(0,0,0,0.8)]"
              style={{ left: '50%' }}
            />
          )}

          {/* Handle Button */}
          {!isShowingOriginal && (
            <div
              ref={handleRef}
              onMouseDown={handleMouseDownSlider}
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-[#181820] border-2 border-indigo-500 text-white flex items-center justify-center shadow-2xl cursor-ew-resize hover:scale-110 active:scale-95 transition-transform z-40"
              style={{ left: '50%' }}
            >
              <SlidersHorizontal size={16} className="rotate-90 text-indigo-400" />
            </div>
          )}

          {/* 1:1 Loupe Lens Overlay Lens */}
          {isLoupeActive && loupePos && (
            <div
              className="absolute w-36 h-36 rounded-full border-2 border-indigo-400 shadow-2xl pointer-events-none z-50 overflow-hidden bg-black"
              style={{
                left: `${loupePos.x - 72}px`,
                top: `${loupePos.y - 72}px`,
              }}
            >
              <img
                src={upscaledSrc}
                alt="Loupe Zoom"
                className="w-full h-full object-none pointer-events-none"
                style={{
                  objectPosition: `${loupePos.pctX}% ${loupePos.pctY}%`,
                  transform: 'scale(2.5)',
                  transformOrigin: `${loupePos.pctX}% ${loupePos.pctY}%`,
                }}
              />
              <div className="absolute bottom-1 right-2 text-[9px] font-mono font-bold text-indigo-300 bg-black/80 px-1 rounded">
                2.5x
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
