import { useRef, useEffect, useContext } from "react";
import { MediaItem } from "../types";
import { AppStateContext } from "../state/context";

interface Props {
  item: MediaItem;
  audioUrl: string | null;
  isGif: boolean;
}

export function VideoSlide({ item, audioUrl, isGif }: Props) {
  const { isMuted } = useContext(AppStateContext);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

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

  // Update mute state
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
    }
  }, [isMuted]);

  return (
    <div className="flex items-center justify-center w-full h-full">
      <video
        ref={videoRef}
        src={item.url}
        className="max-w-full max-h-full object-contain"
        autoPlay
        loop={isGif}
        muted={isGif || !audioUrl}
        playsInline
        controls={!isGif}
      />
      {audioUrl && (
        <audio ref={audioRef} src={audioUrl} muted={isMuted} preload="auto" />
      )}
    </div>
  );
}
