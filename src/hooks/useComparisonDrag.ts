import { useState, useEffect, useCallback, useRef } from 'react';

interface UseComparisonDragOptions {
  zoom?: number;
  onZoomChange?: (newZoom: number) => void;
  activeMode: 'split' | 'side';
}

export function useComparisonDrag({
  zoom = 1,
  onZoomChange,
  activeMode,
}: UseComparisonDragOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [sliderPct, setSliderPct] = useState(52);
  const [isDragging, setIsDragging] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [isHolding, setIsHolding] = useState(false);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (zoom <= 1) {
      setPanOffset({ x: 0, y: 0 });
    }
  }, [zoom]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault();
        setIsHolding(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setIsHolding(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 1.25 : 0.8;
    const newZoom = Math.max(1, Math.min(10, Math.round(zoom * delta * 10) / 10));
    if (onZoomChange) {
      onZoomChange(newZoom);
    }
  };

  const updateSlider = useCallback((clientX: number) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const pct = Math.max(1, Math.min(99, ((clientX - rect.left) / rect.width) * 100));
    setSliderPct(pct);
  }, []);

  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      if (zoom > 1) {
        setIsPanning(true);
        setStartPan({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
      } else if (activeMode === 'split') {
        setIsDragging(true);
        updateSlider(e.clientX);
      }
    },
    [zoom, panOffset, activeMode, updateSlider]
  );

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

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isPanning, startPan, updateSlider]);

  return {
    containerRef,
    sliderPct,
    isDragging,
    isPanning,
    isHolding,
    panOffset,
    handleWheel,
    handleCanvasMouseDown,
    handleHandleMouseDown,
  };
}
