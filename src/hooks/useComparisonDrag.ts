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

  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const onZoomChangeRef = useRef(onZoomChange);
  onZoomChangeRef.current = onZoomChange;

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
    // A key-up while the window is unfocused (e.g. Space held, then
    // alt-tabbing away) never reaches this handler, leaving isHolding
    // stuck true -- the comparison slider would stay pinned to 100% until
    // another Space press, with no way to tell why.
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

  // React attaches wheel listeners passively on the root as of React 17+,
  // so e.preventDefault() inside a JSX onWheel handler is a silent no-op
  // (with a console warning). A native, explicitly non-passive listener on
  // the actual container is required to suppress default scroll/zoom
  // behavior while wheeling to zoom.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleNativeWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 1.25 : 0.8;
      const newZoom = Math.max(1, Math.min(10, Math.round(zoomRef.current * delta * 10) / 10));
      onZoomChangeRef.current?.(newZoom);
    };

    container.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleNativeWheel);
  }, [activeMode]);

  const rafRef = useRef<number | null>(null);
  const pendingClientXRef = useRef<number | null>(null);

  const updateSlider = useCallback((clientX: number) => {
    // Coalesce to at most one state update per animation frame instead of
    // one per raw pointermove tick, which can fire far faster than the
    // display refreshes.
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
      if (e.button !== 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
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
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      setIsDragging(true);
      updateSlider(e.clientX);
    },
    [updateSlider]
  );

  useEffect(() => {
    // Once setPointerCapture has been called (in the handlers above), the
    // capturing element keeps receiving pointermove/pointerup for this
    // pointer even when the cursor moves outside its bounds or outside the
    // window -- and these still bubble to window as normal, so listening
    // here continues to work. Plain mousemove/mouseup (the previous
    // implementation) has no such guarantee: releasing the button after
    // the cursor has left the OS window is easy to do near a split-view
    // edge, and the drag would stay glued to the cursor until another
    // click. pointercancel (fired if the OS interrupts the gesture, e.g.
    // an alt-tab mid-drag) is handled the same as pointerup.
    const handlePointerMove = (e: PointerEvent) => {
      if (isPanning) {
        setPanOffset({
          x: e.clientX - startPan.x,
          y: e.clientY - startPan.y,
        });
      } else if (isDragging) {
        updateSlider(e.clientX);
      }
    };

    const endDrag = () => {
      setIsDragging(false);
      setIsPanning(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    window.addEventListener('blur', endDrag);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);
      window.removeEventListener('blur', endDrag);
    };
  }, [isDragging, isPanning, startPan, updateSlider]);

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
