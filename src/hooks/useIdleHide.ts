import { useState, useEffect, useCallback, useRef } from "react";

/** Returns true when the UI should be visible (mouse recently moved or hovering over UI chrome). */
export function useIdleHide(timeoutMs = 2000): boolean {
  const [visible, setVisible] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hovering = useRef(false);

  const resetTimer = useCallback(() => {
    setVisible(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (!hovering.current) setVisible(false);
    }, timeoutMs);
  }, [timeoutMs]);

  useEffect(() => {
    const onMove = () => resetTimer();
    window.addEventListener("mousemove", onMove);
    resetTimer();
    return () => {
      window.removeEventListener("mousemove", onMove);
      clearTimeout(timer.current);
    };
  }, [resetTimer]);

  // Expose a way for chrome elements to signal hover
  useEffect(() => {
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
  }, [resetTimer]);

  return visible;
}
