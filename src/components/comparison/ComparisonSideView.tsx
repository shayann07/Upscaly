import React from 'react';
import { ComparisonMediaOverlay } from './ComparisonMediaOverlay';

interface ComparisonSideViewProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  handleCanvasMouseDown: (e: React.PointerEvent) => void;
  zoom: number;
  isPanning: boolean;
  inputSrc: string;
  outputSrc: string;
  isVideoInput: boolean;
  isVideoOutput: boolean;
  videoInputRef: React.RefObject<HTMLVideoElement | null>;
  videoOutputRef: React.RefObject<HTMLVideoElement | null>;
  panOffset: { x: number; y: number };
  inputDims: { w: number; h: number } | null;
  outputDims: { w: number; h: number } | null;
  accentColor: string;
}

export function ComparisonSideView({
  containerRef,
  handleCanvasMouseDown,
  zoom,
  isPanning,
  inputSrc,
  outputSrc,
  isVideoInput,
  isVideoOutput,
  videoInputRef,
  videoOutputRef,
  panOffset,
  inputDims,
  outputDims,
  accentColor,
}: ComparisonSideViewProps) {
  return (
    <div
      ref={containerRef}
      onPointerDown={handleCanvasMouseDown}
      className="absolute inset-0 grid grid-cols-2 gap-0.5 bg-[var(--bg-base)] select-none"
      style={{
        cursor: zoom > 1 ? (isPanning ? 'grabbing' : 'grab') : 'default',
        touchAction: 'none',
      }}
    >
      <div className="relative overflow-hidden">
        <ComparisonMediaOverlay
          src={inputSrc}
          isVideo={isVideoInput}
          videoRef={videoInputRef}
          panOffset={panOffset}
          zoom={zoom}
          isPanning={isPanning}
        />
        <div className="absolute bottom-3 left-3 px-2 py-1 rounded bg-[rgba(11,10,9,.8)] font-['Martian_Mono',monospace] text-[9px] text-[var(--text-tertiary)] tracking-[0.06em]">
          ORIGINAL{inputDims ? ` · ${inputDims.w}×${inputDims.h}` : ''}
        </div>
      </div>
      <div className="relative overflow-hidden">
        <ComparisonMediaOverlay
          src={outputSrc}
          isVideo={isVideoOutput}
          videoRef={videoOutputRef}
          panOffset={panOffset}
          zoom={zoom}
          isPanning={isPanning}
        />
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
