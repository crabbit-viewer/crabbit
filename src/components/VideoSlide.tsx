import { useEffect, useContext, useState } from "react";
import { invoke } from "../invoke";
import { MediaItem } from "../types";
import { AppStateContext } from "../state/context";

interface Props {
  item: MediaItem;
  audioUrl: string | null;
  isGif: boolean;
  rotation: number;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  audioRef: React.RefObject<HTMLAudioElement | null>;
}

let cachedPort: number | null = null;

async function getServerPort(): Promise<number> {
  if (cachedPort !== null) return cachedPort;
  cachedPort = await invoke<number>("get_video_server_port");
  return cachedPort;
}

export function VideoSlide({ item, audioUrl, isGif, rotation, videoRef, audioRef }: Props) {
  const { isMuted, volume } = useContext(AppStateContext);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setVideoError(null);
      setReady(false);
      const t0 = performance.now();

      try {
        const port = await getServerPort();
        const videoKey: string = await invoke("preload_video", { url: item.url });
        console.log(`[VideoSlide] preload_video done in ${(performance.now() - t0).toFixed(0)}ms for ${item.url.split('/').pop()}`);
        if (cancelled) return;

        const video = videoRef.current;
        if (video) {
          video.src = `http://127.0.0.1:${port}/${videoKey}`;
          video.load();
        }

        if (audioUrl && audioRef.current) {
          const tAudio = performance.now();
          const audioKey: string = await invoke("preload_video", { url: audioUrl });
          console.log(`[VideoSlide] audio preload done in ${(performance.now() - tAudio).toFixed(0)}ms`);
          if (cancelled) return;
          audioRef.current.src = `http://127.0.0.1:${port}/${audioKey}`;
          audioRef.current.load();
        }

        console.log(`[VideoSlide] ready in ${(performance.now() - t0).toFixed(0)}ms total`);
        setReady(true);
      } catch (e) {
        if (!cancelled) {
          setVideoError(`Fetch failed: ${e}`);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [item.url, audioUrl]);

  // Video error handling
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !ready) return;

    const onError = () => {
      const e = video.error;
      const msg = e ? `Code ${e.code}: ${e.message}` : "Unknown error";
      setVideoError(msg);
    };

    video.addEventListener("error", onError);
    return () => video.removeEventListener("error", onError);
  }, [ready, item.url]);

  // Audio sync
  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video || !audio || !audioUrl) return;

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
  }, [audioUrl, ready]);

  // Volume/mute
  useEffect(() => {
    const vol = volume / 100;
    if (audioRef.current && audioUrl) {
      audioRef.current.muted = isMuted;
      audioRef.current.volume = vol;
    }
    if (!audioUrl && !isGif && videoRef.current) {
      videoRef.current.muted = isMuted;
      videoRef.current.volume = vol;
    }
  }, [isMuted, volume, audioUrl, isGif]);

  // Set video element attributes based on current props
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.autoplay = true;
    video.loop = true;
    video.playsInline = true;
    video.controls = !isGif && rotation === 0;
    video.muted = isGif || (!!audioUrl ? true : isMuted);
  }, [isGif, audioUrl, isMuted, ready, rotation]);

  return (
    <>
      {videoError && (
        <div className="absolute bottom-4 left-4 right-4 bg-red-900/80 text-white text-xs p-2 rounded font-mono break-all z-10">
          Video error: {videoError}<br />
          URL: {item.url}
        </div>
      )}
    </>
  );
}
