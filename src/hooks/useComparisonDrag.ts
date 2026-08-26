import { useState, useEffect, useCallback, useRef } from 'react';

interface UseComparisonDragOptions {
  zoom?: number;
  onZoomChange?: (newZoom: number) => void;
  activeMode: 'split' | 'side';
}

interface PointerCoord {
  clientX: number;
  clientY: number;
}

function useSpaceKeyHold(): boolean {
  const [isHolding, setIsHolding] = useState(false);

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
    const handleBlur = () => setIsHolding(false);

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  return isHolding;
}

function useWheelZoom(
  containerRef: React.RefObject<HTMLDivElement | null>,
  zoomRef: React.RefObject<number>,
  onZoomChangeRef: React.RefObject<((newZoom: number) => void) | undefined>,
  activeMode: 'split' | 'side'
) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleNativeWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 1.25 : 0.8;
      const currentZoom = zoomRef.current ?? 1;
      const newZoom = Math.max(1, Math.min(10, Math.round(currentZoom * delta * 10) / 10));
      onZoomChangeRef.current?.(newZoom);
    };

    container.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleNativeWheel);
  }, [containerRef, zoomRef, onZoomChangeRef, activeMode]);
}

interface PointerGestureParams {
  activePointersRef: React.RefObject<Map<number, PointerCoord>>;
  initialPinchDistRef: React.RefObject<number | null>;
  initialPinchZoomRef: React.RefObject<number>;
  initialMidpointRef: React.RefObject<{ x: number; y: number } | null>;
  initialPanRef: React.RefObject<{ x: number; y: number }>;
  onZoomChangeRef: React.RefObject<((newZoom: number) => void) | undefined>;
  isPanning: boolean;
  isDragging: boolean;
  startPan: { x: number; y: number };
  setPanOffset: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
  setIsPanning: (val: boolean) => void;
  setIsDragging: (val: boolean) => void;
  updateSlider: (clientX: number) => void;
}

function usePointerGestureListeners(params: PointerGestureParams) {
  const {
    activePointersRef,
    initialPinchDistRef,
    initialPinchZoomRef,
    initialMidpointRef,
    initialPanRef,
    onZoomChangeRef,
    isPanning,
    isDragging,
    startPan,
    setPanOffset,
    setIsPanning,
    setIsDragging,
    updateSlider,
  } = params;

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      const activePointers = activePointersRef.current;
      if (!activePointers) return;
      if (activePointers.has(e.pointerId)) {
        activePointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
      }

      if (activePointers.size === 2) {
        const [p1, p2] = Array.from(activePointers.values());
        const currentDist = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);
        const currentMid = { x: (p1.clientX + p2.clientX) / 2, y: (p1.clientY + p2.clientY) / 2 };

        if (initialPinchDistRef.current && initialPinchDistRef.current > 0) {
          const scale = currentDist / initialPinchDistRef.current;
          const newZoom = Math.max(
            1,
            Math.min(10, Math.round((initialPinchZoomRef.current ?? 1) * scale * 10) / 10)
          );
          onZoomChangeRef.current?.(newZoom);
        }

        if (initialMidpointRef.current && initialPanRef.current) {
          const dx = currentMid.x - initialMidpointRef.current.x;
          const dy = currentMid.y - initialMidpointRef.current.y;
          setPanOffset({ x: initialPanRef.current.x + dx, y: initialPanRef.current.y + dy });
        }
      } else if (isPanning) {
        setPanOffset({ x: e.clientX - startPan.x, y: e.clientY - startPan.y });
      } else if (isDragging) {
        updateSlider(e.clientX);
      }
    };

    const endDrag = (e: PointerEvent) => {
      const activePointers = activePointersRef.current;
      if (!activePointers) return;
      activePointers.delete(e.pointerId);
      if (activePointers.size < 2) {
        initialPinchDistRef.current = null;
        initialMidpointRef.current = null;
      }
      if (activePointers.size === 0) {
        setIsDragging(false);
        setIsPanning(false);
      }
    };

    const handleWindowBlur = () => {
      activePointersRef.current?.clear();
      initialPinchDistRef.current = null;
      initialMidpointRef.current = null;
      setIsDragging(false);
      setIsPanning(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [
    activePointersRef,
    initialPinchDistRef,
    initialPinchZoomRef,
    initialMidpointRef,
    initialPanRef,
    onZoomChangeRef,
    isPanning,
    isDragging,
    startPan,
    setPanOffset,
    setIsPanning,
    setIsDragging,
    updateSlider,
  ]);
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
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });

  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const onZoomChangeRef = useRef(onZoomChange);
  onZoomChangeRef.current = onZoomChange;
  const panOffsetRef = useRef(panOffset);
  panOffsetRef.current = panOffset;

  const activePointersRef = useRef<Map<number, PointerCoord>>(new Map());
  const initialPinchDistRef = useRef<number | null>(null);
  const initialPinchZoomRef = useRef<number>(1);
  const initialMidpointRef = useRef<{ x: number; y: number } | null>(null);
  const initialPanRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const isHolding = useSpaceKeyHold();
  useWheelZoom(containerRef, zoomRef, onZoomChangeRef, activeMode);

  useEffect(() => {
    if (zoom <= 1) setPanOffset({ x: 0, y: 0 });
  }, [zoom]);

  const rafRef = useRef<number | null>(null);
  const pendingClientXRef = useRef<number | null>(null);

  const updateSlider = useCallback((clientX: number) => {
    pendingClientXRef.current = clientX;
    if (rafRef.current !== null) return;

    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const x = pendingClientXRef.current;
      const container = containerRef.current;
      if (x === null || !container) return;
      const rect = container.getBoundingClientRect();
      const pct = Math.max(1, Math.min(99, ((x - rect.left) / rect.width) * 100));
      setSliderPct(pct);
    });
  }, []);

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    },
    []
  );

  const handleCanvasMouseDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Safe fallback
      }
      activePointersRef.current.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });

      if (activePointersRef.current.size === 1) {
        if (zoom > 1) {
          setIsPanning(true);
          setStartPan({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
        } else if (activeMode === 'split') {
          setIsDragging(true);
          updateSlider(e.clientX);
        }
      } else if (activePointersRef.current.size === 2) {
        setIsDragging(false);
        setIsPanning(false);
        const [p1, p2] = Array.from(activePointersRef.current.values());
        initialPinchDistRef.current = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);
        initialPinchZoomRef.current = zoomRef.current;
        initialMidpointRef.current = {
          x: (p1.clientX + p2.clientX) / 2,
          y: (p1.clientY + p2.clientY) / 2,
        };
        initialPanRef.current = { ...panOffsetRef.current };
      }
    },
    [zoom, panOffset, activeMode, updateSlider]
  );

  const handleHandleMouseDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      e.stopPropagation();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Safe fallback
      }
      activePointersRef.current.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
      setIsDragging(true);
      updateSlider(e.clientX);
    },
    [updateSlider]
  );

  usePointerGestureListeners({
    activePointersRef,
    initialPinchDistRef,
    initialPinchZoomRef,
    initialMidpointRef,
    initialPanRef,
    onZoomChangeRef,
    isPanning,
    isDragging,
    startPan,
    setPanOffset,
    setIsPanning,
    setIsDragging,
    updateSlider,
  });

  return {
    containerRef,
    sliderPct,
    isDragging,
    isPanning,
    isHolding,
    panOffset,
    handleCanvasMouseDown,
    handleHandleMouseDown,
  };
}
