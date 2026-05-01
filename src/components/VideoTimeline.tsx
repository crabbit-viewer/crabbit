import { useRef, useCallback, useEffect, useState } from "react";

interface Props {
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  visible: boolean;
}

export function VideoTimeline({ currentTime, duration, onSeek, visible }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [hoverProgress, setHoverProgress] = useState<number | null>(null);

  const progress = duration > 0 ? currentTime / duration : 0;

  const computeTime = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track || duration <= 0) return 0;
      const rect = track.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return ratio * duration;
    },
    [duration],
  );

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setDragging(true);
      onSeek(computeTime(e.clientX));
    },
    [computeTime, onSeek],
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const track = trackRef.current;
      if (!track || duration <= 0) return;
      const rect = track.getBoundingClientRect();
      setHoverProgress(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
    },
    [duration],
  );

  const onMouseLeave = useCallback(() => {
    setHoverProgress(null);
  }, []);

  // Handle drag globally
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      onSeek(computeTime(e.clientX));
    };
    const onUp = () => setDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, computeTime, onSeek]);

  if (duration <= 0) return null;

  const chromeClass = `ui-chrome ui-bottom ${visible ? "" : "ui-hidden"}`;

  return (
    <div
      ref={trackRef}
      className={`absolute left-0 right-0 z-10 cursor-pointer group ${chromeClass}`}
      style={{ bottom: "44px", height: "14px", paddingTop: "8px" }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      data-ui-chrome
    >
      {/* Track background */}
      <div className="absolute bottom-0 left-0 right-0 h-[3px] group-hover:h-[5px] transition-all bg-white/15">
        {/* Hover preview */}
        {hoverProgress !== null && (
          <div
            className="absolute top-0 bottom-0 bg-white/20"
            style={{ width: `${hoverProgress * 100}%` }}
          />
        )}
        {/* Progress fill */}
        <div
          className="absolute top-0 bottom-0 bg-white/80"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
    </div>
  );
}
