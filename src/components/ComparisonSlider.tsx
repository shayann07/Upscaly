import { useRef, useState, useEffect, useMemo } from 'react';
import { getMediaSrc } from '../lib/media';
import { useComparisonDrag } from '../hooks/useComparisonDrag';

interface ComparisonSliderProps {
  inputPath?: string;
  outputPath?: string;
  originalPath?: string;
  upscaledPath?: string;
  mode?: 'split' | 'side';
  viewMode?: 'split' | 'side-by-side';
  zoom?: number;
  onZoomChange?: (newZoom: number) => void;
  accentColor?: string;
  onToggleViewMode?: () => void;
  isHoldingOriginal?: boolean;
}

export function ComparisonSlider({
  inputPath,
  outputPath,
  originalPath,
  upscaledPath,
  mode = 'split',
  viewMode,
  zoom = 1,
  onZoomChange,
  accentColor = 'var(--accent)',
}: ComparisonSliderProps) {
  const videoInputRef = useRef<HTMLVideoElement>(null);
  const videoOutputRef = useRef<HTMLVideoElement>(null);

  const [inputDims, setInputDims] = useState<{ w: number; h: number } | null>(
    null
  );
  const [outputDims, setOutputDims] = useState<{ w: number; h: number } | null>(
    null
  );

  const realInputPath = inputPath || originalPath || '';
  const realOutputPath = outputPath || upscaledPath || '';
  const activeMode = viewMode === 'side-by-side' ? 'side' : mode;

  const isVideoInput = useMemo(
    () => /\.(mp4|mkv|mov|avi|webm)$/i.test(realInputPath),
    [realInputPath]
  );
  const isVideoOutput = useMemo(
    () => /\.(mp4|mkv|mov|avi|webm)$/i.test(realOutputPath),
    [realOutputPath]
  );

  const inputSrc = useMemo(() => getMediaSrc(realInputPath), [realInputPath]);
  const outputSrc = useMemo(
    () => getMediaSrc(realOutputPath),
    [realOutputPath]
  );

  const {
    containerRef,
    sliderPct,
    isDragging,
    isPanning,
    isHolding,
    panOffset,
    handleWheel,
    handleCanvasMouseDown,
    handleHandleMouseDown,
  } = useComparisonDrag({ zoom, onZoomChange, activeMode });

  useEffect(() => {
    setInputDims(null);
    setOutputDims(null);
  }, [inputSrc, outputSrc]);

  useEffect(() => {
    let isMounted = true;

    if (inputSrc) {
      if (isVideoInput) {
        const vid1 = document.createElement('video');
        vid1.onloadedmetadata = () => {
          if (isMounted)
            setInputDims({ w: vid1.videoWidth, h: vid1.videoHeight });
        };
        vid1.src = inputSrc;
      } else {
        const img1 = new Image();
        img1.onload = () => {
          if (isMounted)
            setInputDims({ w: img1.naturalWidth, h: img1.naturalHeight });
        };
        img1.src = inputSrc;
      }
    }

    if (outputSrc) {
      if (isVideoOutput) {
        const vid2 = document.createElement('video');
        vid2.onloadedmetadata = () => {
          if (isMounted)
            setOutputDims({ w: vid2.videoWidth, h: vid2.videoHeight });
        };
        vid2.src = outputSrc;
      } else {
        const img2 = new Image();
        img2.onload = () => {
          if (isMounted)
            setOutputDims({ w: img2.naturalWidth, h: img2.naturalHeight });
        };
        img2.src = outputSrc;
      }
    }

    return () => {
      isMounted = false;
    };
  }, [inputSrc, outputSrc, isVideoInput, isVideoOutput]);

  useEffect(() => {
    const v1 = videoInputRef.current;
    const v2 = videoOutputRef.current;
    if (!v1 || !v2) return;

    v1.play().catch(() => {});
    v2.play().catch(() => {});

    const syncTime = () => {
      if (Math.abs(v1.currentTime - v2.currentTime) > 0.08) {
        v2.currentTime = v1.currentTime;
      }
    };

    v1.addEventListener('timeupdate', syncTime);
    return () => v1.removeEventListener('timeupdate', syncTime);
  }, [inputSrc, outputSrc, activeMode]);

  const mediaContainerStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    transform: `translate3d(${panOffset.x}px, ${panOffset.y}px, 0px) scale3d(${zoom}, ${zoom}, 1)`,
    transformOrigin: 'center center',
    transition: isPanning
      ? 'none'
      : 'transform 0.12s cubic-bezier(0.16, 1, 0.3, 1)',
    willChange: 'transform',
    backfaceVisibility: 'hidden',
    WebkitBackfaceVisibility: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const renderMedia = (
    src: string,
    isVideo: boolean,
    ref?: React.RefObject<HTMLVideoElement | null>
  ) => {
    if (!src) return null;

    if (isVideo) {
      return (
        <div style={mediaContainerStyle}>
          <video
            ref={ref}
            src={src}
            autoPlay
            loop
            muted
            playsInline
            onPlay={() => {
              if (ref === videoInputRef && videoOutputRef.current) {
                videoOutputRef.current.play().catch(() => {});
              }
            }}
            className="w-full h-full object-contain pointer-events-none"
            style={{ backfaceVisibility: 'hidden' }}
          />
        </div>
      );
    }

    return (
      <div style={mediaContainerStyle}>
        <img
          src={src}
          alt=""
          className="w-full h-full object-contain pointer-events-none select-none"
          draggable={false}
          style={{ backfaceVisibility: 'hidden' }}
        />
      </div>
    );
  };

  if (activeMode === 'side') {
    return (
      <div
        onWheel={handleWheel}
        onMouseDown={handleCanvasMouseDown}
        className="absolute inset-0 grid grid-cols-2 gap-0.5 bg-[var(--bg-base)] select-none"
        style={{
          cursor: zoom > 1 ? (isPanning ? 'grabbing' : 'grab') : 'default',
        }}
      >
        <div className="relative overflow-hidden">
          {renderMedia(inputSrc, isVideoInput, videoInputRef)}
          <div className="absolute bottom-3 left-3 px-2 py-1 rounded bg-[rgba(11,10,9,.8)] font-['Martian_Mono',monospace] text-[9px] text-[var(--text-tertiary)] tracking-[0.06em]">
            ORIGINAL{inputDims ? ` · ${inputDims.w}×${inputDims.h}` : ''}
          </div>
        </div>
        <div className="relative overflow-hidden">
          {renderMedia(outputSrc, isVideoOutput, videoOutputRef)}
          <div
            className="absolute bottom-3 right-3 px-2 py-1 rounded bg-[rgba(11,10,9,.8)] font-['Martian_Mono',monospace] text-[9px] tracking-[0.06em]"
            style={{ color: accentColor }}
          >
            UPSCALED{outputDims ? ` · ${outputDims.w}×${outputDims.h}` : ''}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      onMouseDown={handleCanvasMouseDown}
      className="absolute inset-0 overflow-hidden select-none"
      style={{
        cursor: zoom > 1 ? (isPanning ? 'grabbing' : 'grab') : 'ew-resize',
      }}
    >
      <div className="absolute inset-0">
        {renderMedia(outputSrc, isVideoOutput, videoOutputRef)}
      </div>

      <div
        className="absolute inset-0"
        style={{
          clipPath: `inset(0 ${isHolding ? 0 : 100 - sliderPct}% 0 0)`,
          transition: isDragging ? 'none' : 'clip-path .08s linear',
          willChange: 'clip-path',
        }}
      >
        {renderMedia(inputSrc, isVideoInput, videoInputRef)}
      </div>

      <div
        onMouseDown={handleHandleMouseDown}
        className="absolute top-0 bottom-0 w-3 -ml-[6px] z-[20] cursor-ew-resize flex justify-center items-center pointer-events-auto"
        style={{
          left: `${isHolding ? 100 : sliderPct}%`,
          opacity: isHolding ? 0 : 1,
          transition: isDragging ? 'none' : 'left .08s linear',
          willChange: 'left',
        }}
      >
        <div className="w-px h-full bg-[var(--text-primary)] shadow-[0_0_8px_rgba(0,0,0,.8)]" />
        <div
          className="absolute top-1/2 w-7 h-7 rounded-full bg-[var(--text-primary)] flex items-center justify-center cursor-ew-resize shadow-[0_4px_14px_rgba(0,0,0,.6)] transition-transform duration-150 hover:scale-110 active:scale-95 pointer-events-auto"
          style={{ transform: 'translateY(-50%)' }}
        >
          <span className="font-['Martian_Mono',monospace] text-[9px] text-[var(--bg-base)] tracking-[0.04em]">
            ◀▶
          </span>
        </div>
      </div>

      <div className="absolute bottom-3 left-3 px-2 py-1 rounded bg-[rgba(11,10,9,.8)] font-['Martian_Mono',monospace] text-[9px] text-[var(--text-tertiary)] tracking-[0.06em] z-10 pointer-events-none">
        ORIGINAL{inputDims ? ` · ${inputDims.w}×${inputDims.h}` : ''}
      </div>
      <div
        className="absolute bottom-3 right-3 px-2 py-1 rounded bg-[rgba(11,10,9,.8)] font-['Martian_Mono',monospace] text-[9px] tracking-[0.06em] z-10 pointer-events-none"
        style={{ color: accentColor }}
      >
        UPSCALED{outputDims ? ` · ${outputDims.w}×${outputDims.h}` : ''}
      </div>
    </div>
  );
}

export default ComparisonSlider;
