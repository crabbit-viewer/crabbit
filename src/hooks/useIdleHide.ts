import { useState, useEffect, useCallback, useRef } from "react";

/** Returns true when the UI should be visible.
 *  Only auto-hides in fullscreen mode (mouse idle timeout).
 *  In windowed mode, UI is always visible — use T key to toggle overlay. */
export function useIdleHide(timeoutMs = 2000): boolean {
  const [visible, setVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hovering = useRef(false);

  // Track fullscreen state
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const resetTimer = useCallback(() => {
    setVisible(true);
    clearTimeout(timer.current);
    if (!isFullscreen) return; // Only auto-hide in fullscreen
    timer.current = setTimeout(() => {
      if (!hovering.current) setVisible(false);
    }, timeoutMs);
  }, [timeoutMs, isFullscreen]);

  useEffect(() => {
    if (!isFullscreen) {
      setVisible(true);
      clearTimeout(timer.current);
      return;
    }
    const onMove = () => resetTimer();
    window.addEventListener("mousemove", onMove);
    resetTimer();
    return () => {
      window.removeEventListener("mousemove", onMove);
      clearTimeout(timer.current);
    };
  }, [resetTimer, isFullscreen]);

  // Expose a way for chrome elements to signal hover
  useEffect(() => {
    if (!isFullscreen) return;
    const onEnter = (e: MouseEvent) => {
      if ((e.target as HTMLElement)?.closest?.("[data-ui-chrome]")) {
        hovering.current = true;
        setVisible(true);
      }
    };
    const onLeave = (e: MouseEvent) => {
      if ((e.target as HTMLElement)?.closest?.("[data-ui-chrome]")) {
        hovering.current = false;
        resetTimer();
      }
    };
    window.addEventListener("mouseenter", onEnter, true);
    window.addEventListener("mouseleave", onLeave, true);
    return () => {
      window.removeEventListener("mouseenter", onEnter, true);
      window.removeEventListener("mouseleave", onLeave, true);
    };
  }, [resetTimer, isFullscreen]);

  return visible;
}
