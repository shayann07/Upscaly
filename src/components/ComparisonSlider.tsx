import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";

interface ComparisonSliderProps {
  inputPath?: string;
  outputPath?: string;
  originalPath?: string;
  upscaledPath?: string;
  mode?: "split" | "side";
  viewMode?: "split" | "side-by-side";
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
  mode = "split",
  viewMode,
  zoom = 1,
  onZoomChange,
  accentColor = "var(--accent)",
}: ComparisonSliderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [sliderPct, setSliderPct] = useState(52);
  const [isDragging, setIsDragging] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [isHolding, setIsHolding] = useState(false);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });

  const [inputDims, setInputDims] = useState<{ w: number; h: number } | null>(null);
  const [outputDims, setOutputDims] = useState<{ w: number; h: number } | null>(null);

  const realInputPath = inputPath || originalPath || "";
  const realOutputPath = outputPath || upscaledPath || "";
  const activeMode = viewMode === "side-by-side" ? "side" : mode;

  const inputSrc = useMemo(() => realInputPath ? convertFileSrc(realInputPath) : "", [realInputPath]);
  const outputSrc = useMemo(() => realOutputPath ? convertFileSrc(realOutputPath) : "", [realOutputPath]);

  // Reset pan when zoom is reset to 1x
  useEffect(() => {
    if (zoom <= 1) {
      setPanOffset({ x: 0, y: 0 });
    }
  }, [zoom]);

  // Get image dimensions
  useEffect(() => {
    if (!inputSrc || !outputSrc) return;
    const img1 = new Image();
    img1.onload = () => setInputDims({ w: img1.naturalWidth, h: img1.naturalHeight });
    img1.src = inputSrc;

    const img2 = new Image();
    img2.onload = () => setOutputDims({ w: img2.naturalWidth, h: img2.naturalHeight });
    img2.src = outputSrc;
  }, [inputSrc, outputSrc]);

  // Space hold for reveal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && e.target === document.body) {
        e.preventDefault();
        setIsHolding(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") setIsHolding(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  // Mouse wheel zoom handler
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 1.25 : 0.8;
    const newZoom = Math.max(1, Math.min(10, Math.round(zoom * delta * 10) / 10));
    if (onZoomChange) {
      onZoomChange(newZoom);
    }
  };

  const updateSlider = useCallback(
    (clientX: number) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const pct = Math.max(1, Math.min(99, ((clientX - rect.left) / rect.width) * 100));
      setSliderPct(pct);
    },
    []
  );

  // Background canvas mouse down (pan if zoomed, or drag slider if 1x)
  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      if (zoom > 1) {
        setIsPanning(true);
        setStartPan({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
      } else if (activeMode === "split") {
        setIsDragging(true);
        updateSlider(e.clientX);
      }
    },
    [zoom, panOffset, activeMode, updateSlider]
  );

  // Split handle mouse down (always drags split slider regardless of zoom)
  const handleHandleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      setIsDragging(true);
      updateSlider(e.clientX);
    },
    [updateSlider]
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isPanning) {
        setPanOffset({
          x: e.clientX - startPan.x,
          y: e.clientY - startPan.y,
        });
      } else if (isDragging) {
        updateSlider(e.clientX);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsPanning(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, isPanning, startPan, updateSlider]);

  const EASE = "var(--ease-spring)";

  // Image style matrix with zoom and pan transform
  const imageStyle = (src: string): React.CSSProperties => ({
    position: "absolute",
    inset: 0,
    backgroundImage: `url(${src})`,
    backgroundSize: "contain",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    filter: "none",
    transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
    transformOrigin: "center center",
    transition: isPanning ? "none" : `transform .22s ${EASE}`,
  });

  if (activeMode === "side") {
    return (
      <div
        onWheel={handleWheel}
        onMouseDown={handleCanvasMouseDown}
        className="absolute inset-0 grid grid-cols-2 gap-0.5 bg-[var(--bg-base)] select-none"
        style={{ cursor: zoom > 1 ? (isPanning ? "grabbing" : "grab") : "default" }}
      >
        <div className="relative overflow-hidden">
          <div style={imageStyle(inputSrc)} />
          <div className="absolute bottom-3 left-3 px-2 py-1 rounded bg-[rgba(11,10,9,.8)] font-['Martian_Mono',monospace] text-[9px] text-[var(--text-tertiary)] tracking-[0.06em]">
            ORIGINAL{inputDims ? ` · ${inputDims.w}×${inputDims.h}` : ""}
          </div>
        </div>
        <div className="relative overflow-hidden">
          <div style={imageStyle(outputSrc)} />
          <div className="absolute bottom-3 right-3 px-2 py-1 rounded bg-[rgba(11,10,9,.8)] font-['Martian_Mono',monospace] text-[9px] tracking-[0.06em]" style={{ color: accentColor }}>
            UPSCALED{outputDims ? ` · ${outputDims.w}×${outputDims.h}` : ""}
          </div>
        </div>
      </div>
    );
  }

  // Split mode
  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      onMouseDown={handleCanvasMouseDown}
      className="absolute inset-0 overflow-hidden select-none"
      style={{ cursor: zoom > 1 ? (isPanning ? "grabbing" : "grab") : "ew-resize" }}
    >
      {/* Output (fine) layer — full frame */}
      <div className="absolute inset-0">
        <div style={imageStyle(outputSrc)} />
      </div>

      {/* Input (coarse) layer — clipped */}
      <div
        className="absolute inset-0"
        style={{
          clipPath: `inset(0 ${isHolding ? 0 : 100 - sliderPct}% 0 0)`,
          transition: "clip-path .08s linear",
        }}
      >
        <div style={imageStyle(inputSrc)} />
      </div>

      {/* Interactive Slider Divider Line & Hit Zone */}
      <div
        onMouseDown={handleHandleMouseDown}
        className="absolute top-0 bottom-0 w-3 -ml-[6px] z-[20] cursor-ew-resize flex justify-center items-center pointer-events-auto"
        style={{
          left: `${isHolding ? 100 : sliderPct}%`,
          opacity: isHolding ? 0 : 1,
        }}
      >
        <div className="w-px h-full bg-[var(--text-primary)] shadow-[0_0_8px_rgba(0,0,0,.8)]" />

        {/* Handle */}
        <div
          className="absolute top-1/2 w-7 h-7 rounded-full bg-[var(--text-primary)] flex items-center justify-center cursor-ew-resize shadow-[0_4px_14px_rgba(0,0,0,.6)] transition-transform duration-150 hover:scale-110 active:scale-95 pointer-events-auto"
          style={{ transform: "translateY(-50%)" }}
        >
          <span className="font-['Martian_Mono',monospace] text-[9px] text-[var(--bg-base)] tracking-[0.04em]">◀▶</span>
        </div>
      </div>

      {/* Labels */}
      <div className="absolute bottom-3 left-3 px-2 py-1 rounded bg-[rgba(11,10,9,.8)] font-['Martian_Mono',monospace] text-[9px] text-[var(--text-tertiary)] tracking-[0.06em] z-10 pointer-events-none">
        ORIGINAL{inputDims ? ` · ${inputDims.w}×${inputDims.h}` : ""}
      </div>
      <div
        className="absolute bottom-3 right-3 px-2 py-1 rounded bg-[rgba(11,10,9,.8)] font-['Martian_Mono',monospace] text-[9px] tracking-[0.06em] z-10 pointer-events-none"
        style={{ color: accentColor }}
      >
        UPSCALED{outputDims ? ` · ${outputDims.w}×${outputDims.h}` : ""}
      </div>
    </div>
  );
}

export default ComparisonSlider;
