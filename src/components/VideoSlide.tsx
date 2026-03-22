import { useRef, useEffect, useContext, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { MediaItem } from "../types";
import { AppStateContext } from "../state/context";

interface Props {
  item: MediaItem;
  audioUrl: string | null;
  isGif: boolean;
}

export function VideoSlide({ item, audioUrl, isGif }: Props) {
  const { isMuted, volume } = useContext(AppStateContext);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [videoError, setVideoError] = useState<string | null>(null);

  // Debug: log video URL and attach error handler
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    invoke("log_frontend", { level: "info", msg: `Loading video: ${item.url}` });
    setVideoError(null);

    const onError = () => {
      const e = video.error;
      const msg = e ? `Code ${e.code}: ${e.message}` : "Unknown error";
      invoke("log_frontend", { level: "error", msg: `Video error: ${msg} URL: ${item.url}` });
      setVideoError(msg);
    };
    const onLoadedData = () => {
      invoke("log_frontend", { level: "info", msg: `Video loaded OK: ${item.url}` });
    };

    video.addEventListener("error", onError);
    video.addEventListener("loadeddata", onLoadedData);
    return () => {
      video.removeEventListener("error", onError);
      video.removeEventListener("loadeddata", onLoadedData);
    };
  }, [item.url]);

  // Sync audio with video
  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video || !audio) return;

    const syncPlay = () => {
      audio.currentTime = video.currentTime;
      audio.play().catch(() => {});
    };
    const syncPause = () => audio.pause();
    const syncSeek = () => {
      audio.currentTime = video.currentTime;
    };

    video.addEventListener("play", syncPlay);
    video.addEventListener("pause", syncPause);
    video.addEventListener("seeked", syncSeek);

    return () => {
      video.removeEventListener("play", syncPlay);
      video.removeEventListener("pause", syncPause);
      video.removeEventListener("seeked", syncSeek);
    };
  }, [audioUrl]);

  // Update mute state and volume
  useEffect(() => {
    const vol = volume / 100;
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
      audioRef.current.volume = vol;
    }
    // For videos with embedded audio (no separate audio stream), control the video element directly
    if (!audioUrl && !isGif && videoRef.current) {
      videoRef.current.muted = isMuted;
      videoRef.current.volume = vol;
    }
  }, [isMuted, volume, audioUrl, isGif]);

  return (
    <div className="flex items-center justify-center w-full h-full">
      <video
        ref={videoRef}
        src={item.url}
        className="max-w-full max-h-full object-contain"
        autoPlay
        loop
        muted={isGif || (!!audioUrl ? true : isMuted)}
        playsInline
        controls={!isGif}
      />
      {audioUrl && (
        <audio ref={audioRef} src={audioUrl} muted={isMuted} preload="auto" loop />
      )}
      {videoError && (
        <div className="absolute bottom-4 left-4 right-4 bg-red-900/80 text-white text-xs p-2 rounded font-mono">
          Video error: {videoError}<br />
          URL: {item.url}
        </div>
      )}
    </div>
  );
}
