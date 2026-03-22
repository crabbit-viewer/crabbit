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
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let videoBlobUrl: string | null = null;
    let audioBlobUrl: string | null = null;

    async function load() {
      setLoading(true);
      setVideoError(null);
      setVideoSrc(null);
      setAudioSrc(null);

      try {
        const videoBytes: ArrayBuffer = await invoke("fetch_video_bytes", { url: item.url });
        if (cancelled) return;
        const videoBlob = new Blob([videoBytes], { type: "video/mp4" });
        videoBlobUrl = URL.createObjectURL(videoBlob);
        setVideoSrc(videoBlobUrl);

        if (audioUrl) {
          const audioBytes: ArrayBuffer = await invoke("fetch_video_bytes", { url: audioUrl });
          if (cancelled) return;
          const audioBlob = new Blob([audioBytes], { type: "audio/mp4" });
          audioBlobUrl = URL.createObjectURL(audioBlob);
          setAudioSrc(audioBlobUrl);
        }
      } catch (e) {
        if (!cancelled) {
          setVideoError(`Fetch failed: ${e}`);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
      const video = videoRef.current;
      if (video) {
        video.pause();
        video.removeAttribute("src");
        video.load();
      }
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      }
      if (videoBlobUrl) URL.revokeObjectURL(videoBlobUrl);
      if (audioBlobUrl) URL.revokeObjectURL(audioBlobUrl);
    };
  }, [item.url, audioUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoSrc) return;

    const onError = () => {
      const e = video.error;
      const msg = e ? `Code ${e.code}: ${e.message}` : "Unknown error";
      setVideoError(msg);
    };

    video.addEventListener("error", onError);
    return () => video.removeEventListener("error", onError);
  }, [videoSrc, item.url]);

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
  }, [audioSrc]);

  useEffect(() => {
    const vol = volume / 100;
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
      audioRef.current.volume = vol;
    }
    if (!audioUrl && !isGif && videoRef.current) {
      videoRef.current.muted = isMuted;
      videoRef.current.volume = vol;
    }
  }, [isMuted, volume, audioUrl, isGif]);

  if (loading) {
    return (
      <div className="flex items-center justify-center w-full h-full">
        <div className="text-white/50 text-sm">Loading video...</div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center w-full h-full">
      {videoSrc && (
        <video
          ref={videoRef}
          src={videoSrc}
          className="max-w-full max-h-full object-contain"
          autoPlay
          loop
          muted={isGif || (!!audioUrl ? true : isMuted)}
          playsInline
          controls={!isGif}
        />
      )}
      {audioSrc && (
        <audio ref={audioRef} src={audioSrc} muted={isMuted} preload="auto" loop />
      )}
      {videoError && (
        <div className="absolute bottom-4 left-4 right-4 bg-red-900/80 text-white text-xs p-2 rounded font-mono break-all">
          Video error: {videoError}<br />
          URL: {item.url}
        </div>
      )}
    </div>
  );
}
