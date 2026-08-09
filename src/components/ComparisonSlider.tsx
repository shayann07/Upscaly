import { useComparisonDrag } from '../hooks/useComparisonDrag';
import { useComparisonMedia } from '../hooks/useComparisonMedia';
import { ComparisonMediaOverlay } from './comparison/ComparisonMediaOverlay';
import { ComparisonSideView } from './comparison/ComparisonSideView';

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
}

export function ComparisonSlider(props: ComparisonSliderProps) {
  const {
    inputPath,
    outputPath,
    originalPath,
    upscaledPath,
    mode = 'split',
    viewMode,
    zoom = 1,
    onZoomChange,
    accentColor = 'var(--accent)',
  } = props;

  const {
    videoInputRef,
    videoOutputRef,
    inputDims,
    outputDims,
    activeMode,
    isVideoInput,
    isVideoOutput,
    inputSrc,
    outputSrc,
  } = useComparisonMedia({
    inputPath,
    outputPath,
    originalPath,
    upscaledPath,
    mode,
    viewMode,
  });

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

  if (activeMode === 'side') {
    return (
      <ComparisonSideView
        handleWheel={handleWheel}
        handleCanvasMouseDown={handleCanvasMouseDown}
        zoom={zoom}
        isPanning={isPanning}
        inputSrc={inputSrc}
        outputSrc={outputSrc}
        isVideoInput={isVideoInput}
        isVideoOutput={isVideoOutput}
        videoInputRef={videoInputRef}
        videoOutputRef={videoOutputRef}
        panOffset={panOffset}
        inputDims={inputDims}
        outputDims={outputDims}
        accentColor={accentColor}
      />
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
        <ComparisonMediaOverlay
          src={outputSrc}
          isVideo={isVideoOutput}
          videoRef={videoOutputRef}
          panOffset={panOffset}
          zoom={zoom}
          isPanning={isPanning}
        />
      </div>
      <div
        className="absolute inset-0"
        style={{
          clipPath: `inset(0 ${isHolding ? 0 : 100 - sliderPct}% 0 0)`,
          transition: isDragging ? 'none' : 'clip-path .08s linear',
          willChange: 'clip-path',
        }}
      >
        <ComparisonMediaOverlay
          src={inputSrc}
          isVideo={isVideoInput}
          videoRef={videoInputRef}
          panOffset={panOffset}
          zoom={zoom}
          isPanning={isPanning}
        />
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
