import { useCallback, useEffect, useRef, useState } from "react";

export interface ZoomPanState {
  scale: number;
  translateX: number;
  translateY: number;
  cursor: string;
  isZoomed: boolean;
  resetZoom: () => void;
  onMouseDown: (e: React.MouseEvent) => void;
  onDoubleClick: (e: React.MouseEvent) => void;
  /** Callback ref — assign to the container element's ref */
  setContainer: (el: HTMLElement | null) => void;
}

const MIN_SCALE = 1.0;
const MAX_SCALE = 5.0;
const ZOOM_SENSITIVITY = 0.001;
const SNAP_THRESHOLD = 1.01;

export function useZoomPan(
  resetDeps: unknown[],
): ZoomPanState {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [scale, setScale] = useState(1);
  const [translateX, setTranslateX] = useState(0);
  const [translateY, setTranslateY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  // Refs to avoid stale closures in native event listeners
  const scaleRef = useRef(scale);
  const txRef = useRef(translateX);
  const tyRef = useRef(translateY);
  const containerElRef = useRef(container);
  scaleRef.current = scale;
  txRef.current = translateX;
  tyRef.current = translateY;
  containerElRef.current = container;

  const dragStart = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const didDragRef = useRef(false);

  const resetZoom = useCallback(() => {
    setScale(1);
    setTranslateX(0);
    setTranslateY(0);
    setIsDragging(false);
    scaleRef.current = 1;
    txRef.current = 0;
    tyRef.current = 0;
  }, []);

  // Reset on slide/gallery change
  useEffect(() => {
    resetZoom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, resetDeps);

  // Clamp translate so content edge doesn't go past viewport center
  const clampTranslate = useCallback(
    (tx: number, ty: number, s: number) => {
      const el = containerElRef.current;
      if (!el || s <= 1) return { tx: 0, ty: 0 };
      const maxTx = ((s - 1) * el.clientWidth) / 2;
      const maxTy = ((s - 1) * el.clientHeight) / 2;
      return {
        tx: Math.max(-maxTx, Math.min(maxTx, tx)),
        ty: Math.max(-maxTy, Math.min(maxTy, ty)),
      };
    },
    [],
  );

  // Native wheel listener (passive: false to allow preventDefault)
  // Re-attaches whenever the container element changes
  useEffect(() => {
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      const oldScale = scaleRef.current;
      let newScale = oldScale * (1 - e.deltaY * ZOOM_SENSITIVITY);
      newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));

      // Snap to 1x if close
      if (newScale < SNAP_THRESHOLD) {
        newScale = 1;
        setScale(1);
        setTranslateX(0);
        setTranslateY(0);
        scaleRef.current = 1;
        txRef.current = 0;
        tyRef.current = 0;
        return;
      }

      // Zoom toward cursor
      const el = containerElRef.current!;
      const rect = el.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const dx = mouseX - cx;
      const dy = mouseY - cy;

      const ratio = newScale / oldScale;
      const oldTx = txRef.current;
      const oldTy = tyRef.current;
      let newTx = dx - (dx - oldTx) * ratio;
      let newTy = dy - (dy - oldTy) * ratio;

      const clamped = clampTranslate(newTx, newTy, newScale);
      newTx = clamped.tx;
      newTy = clamped.ty;

      setScale(newScale);
      setTranslateX(newTx);
      setTranslateY(newTy);
      scaleRef.current = newScale;
      txRef.current = newTx;
      tyRef.current = newTy;
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [container, clampTranslate]);

  // Mouse drag handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (scaleRef.current <= 1) return;
      // Only left button
      if (e.button !== 0) return;
      e.preventDefault();
      didDragRef.current = false;
      setIsDragging(true);
      dragStart.current = {
        x: e.clientX,
        y: e.clientY,
        tx: txRef.current,
        ty: tyRef.current,
      };
    },
    [],
  );

  // Double-click to toggle zoom
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const el = containerElRef.current;
      if (!el) return;

      if (scaleRef.current > 1) {
        resetZoom();
        return;
      }

      // Zoom to 2x centered on click point
      const newScale = 2;
      const rect = el.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const dx = mouseX - cx;
      const dy = mouseY - cy;

      // translate so click point stays fixed
      const newTx = dx - dx * newScale;
      const newTy = dy - dy * newScale;
      const clamped = clampTranslate(newTx, newTy, newScale);

      setScale(newScale);
      setTranslateX(clamped.tx);
      setTranslateY(clamped.ty);
      scaleRef.current = newScale;
      txRef.current = clamped.tx;
      tyRef.current = clamped.ty;
    },
    [clampTranslate, resetZoom],
  );

  // Attach mouse listeners to container via native events for mousemove/mouseup
  // so drag continues even if mouse leaves the element briefly
  useEffect(() => {
    if (!isDragging) return;
    const handleMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      // Only count as a drag if mouse moved more than a few pixels
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        didDragRef.current = true;
      }
      const clamped = clampTranslate(
        dragStart.current.tx + dx,
        dragStart.current.ty + dy,
        scaleRef.current,
      );
      setTranslateX(clamped.tx);
      setTranslateY(clamped.ty);
      txRef.current = clamped.tx;
      tyRef.current = clamped.ty;
    };
    const handleUp = () => setIsDragging(false);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [isDragging, clampTranslate]);

  // Suppress click events after a drag so video play/pause isn't toggled
  useEffect(() => {
    if (!container) return;
    const suppressClick = (e: MouseEvent) => {
      if (didDragRef.current) {
        e.stopPropagation();
        e.preventDefault();
        didDragRef.current = false;
      }
    };
    container.addEventListener("click", suppressClick, true);
    return () => container.removeEventListener("click", suppressClick, true);
  }, [container]);

  const isZoomed = scale > 1;
  const cursor = isDragging ? "grabbing" : isZoomed ? "grab" : "default";

  return {
    scale,
    translateX,
    translateY,
    cursor,
    isZoomed,
    resetZoom,
    onMouseDown: handleMouseDown,
    onDoubleClick: handleDoubleClick,
    setContainer,
  };
}
