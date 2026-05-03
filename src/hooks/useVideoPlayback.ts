import { useEffect, useRef, useState, useCallback, RefObject } from "react";

export interface VideoPlayback {
  currentTime: number;
  duration: number;
  paused: boolean;
  togglePlay: () => void;
  seek: (time: number) => void;
}

export function useVideoPlayback(
  videoRef: RefObject<HTMLVideoElement | null>,
  _audioRef: RefObject<HTMLAudioElement | null>,
  postId: string | undefined,
): VideoPlayback | null {
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [paused, setPaused] = useState(true);
  const [hasVideo, setHasVideo] = useState(false);

  // Track the actual DOM element so we re-bind listeners when it changes
  // (e.g. switching from saved grid → slideshow mounts a new <video>).
  const boundEl = useRef<HTMLVideoElement | null>(null);
  const [elVersion, setElVersion] = useState(0);

  useEffect(() => {
    if (videoRef.current !== boundEl.current) {
      boundEl.current = videoRef.current;
      setElVersion((v) => v + 1);
    }
  });

  // Track the video element across post changes and element swaps
  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      setHasVideo(false);
      setCurrentTime(0);
      setDuration(0);
      setPaused(true);
      return;
    }

    setHasVideo(true);

    const onTimeUpdate = () => setCurrentTime(video.currentTime);
    const onDurationChange = () => setDuration(video.duration || 0);
    const onLoadedMetadata = () => setDuration(video.duration || 0);
    const onPlay = () => setPaused(false);
    const onPause = () => setPaused(true);

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("durationchange", onDurationChange);
    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);

    // Sync initial state
    setCurrentTime(video.currentTime);
    setDuration(video.duration || 0);
    setPaused(video.paused);

    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("durationchange", onDurationChange);
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
    };
  }, [postId, elVersion, videoRef]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [videoRef]);

  const seek = useCallback(
    (time: number) => {
      const video = videoRef.current;
      if (!video) return;
      video.currentTime = time;
      // Audio sync is handled by VideoSlide's seeked listener
    },
    [videoRef],
  );

  if (!hasVideo) return null;

  return { currentTime, duration, paused, togglePlay, seek };
}
