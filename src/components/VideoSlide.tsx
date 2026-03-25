import { useEffect, useContext, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { MediaItem } from "../types";
import { AppStateContext } from "../state/context";
import { isLinux } from "../platform";

interface Props {
  item: MediaItem;
  audioUrl: string | null;
  isGif: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  audioRef: React.RefObject<HTMLAudioElement | null>;
}

let cachedPort: number | null = null;

async function getServerPort(): Promise<number> {
  if (cachedPort !== null) return cachedPort;
  cachedPort = await invoke<number>("get_video_server_port");
  return cachedPort;
}

// ─── Linux: mpv-backed video ────────────────────────────────────────────────

function MpvVideoSlide({ item, audioUrl, isGif }: Pick<Props, "item" | "audioUrl" | "isGif">) {
  const { isMuted, volume } = useContext(AppStateContext);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load video into mpv
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        console.log("[mpv-slide] Starting load for:", item.url);
        const port = await getServerPort();
        // Preload video (downloads to Rust cache, returns cache key)
        const videoKey: string = await invoke("preload_video", { url: item.url });
        if (cancelled) { console.log("[mpv-slide] Cancelled after preload_video"); return; }
        const videoUrl = `http://127.0.0.1:${port}/${videoKey}`;

        // Preload audio if present (v.redd.it dual stream)
        let audioUrlFull: string | null = null;
        if (audioUrl) {
          const audioKey: string = await invoke("preload_video", { url: audioUrl });
          if (cancelled) { console.log("[mpv-slide] Cancelled after audio preload"); return; }
          audioUrlFull = `http://127.0.0.1:${port}/${audioKey}`;
        }

        console.log("[mpv-slide] Calling mpv_load:", videoUrl);
        // Tell mpv to play
        await invoke("mpv_load", {
          videoUrl,
          audioUrl: audioUrlFull,
          isGif,
          muted: isMuted,
          volume,
        });
        console.log("[mpv-slide] mpv_load succeeded");
      } catch (e) {
        console.error("[mpv-slide] Error:", e);
        if (!cancelled) setError(`${e}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      console.log("[mpv-slide] Cleanup, setting cancelled=true");
      cancelled = true;
      invoke("mpv_stop").catch(() => {});
    };
  }, [item.url, audioUrl]);

  // Sync mute state to mpv
  useEffect(() => {
    invoke("mpv_set_property", {
      name: "mute",
      value: isMuted || isGif ? "yes" : "no",
    }).catch(() => {});
  }, [isMuted, isGif]);

  // Sync volume to mpv
  useEffect(() => {
    invoke("mpv_set_property", {
      name: "volume",
      value: String(volume),
    }).catch(() => {});
  }, [volume]);

  if (loading) {
    return (
      <div className="flex items-center justify-center w-full h-full">
        <div className="text-white/50 text-sm">Loading video...</div>
      </div>
    );
  }

  return (
    <>
      {error && (
        <div className="absolute bottom-4 left-4 right-4 bg-red-900/80 text-white text-xs p-2 rounded font-mono break-all z-10">
          mpv error: {error}
          <br />
          URL: {item.url}
        </div>
      )}
    </>
  );
}

// ─── Non-Linux: HTML5 <video> backed ────────────────────────────────────────

function Html5VideoSlide({ item, audioUrl, isGif, videoRef, audioRef }: Props) {
  const { isMuted, volume } = useContext(AppStateContext);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setVideoError(null);
      setReady(false);

      try {
        const port = await getServerPort();
        const videoKey: string = await invoke("preload_video", { url: item.url });
        if (cancelled) return;

        const video = videoRef.current;
        if (video) {
          video.src = `http://127.0.0.1:${port}/${videoKey}`;
          video.load();
        }

        if (audioUrl && audioRef.current) {
          const audioKey: string = await invoke("preload_video", { url: audioUrl });
          if (cancelled) return;
          audioRef.current.src = `http://127.0.0.1:${port}/${audioKey}`;
          audioRef.current.load();
        }

        setReady(true);
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
    video.controls = !isGif;
    video.muted = isGif || (!!audioUrl ? true : isMuted);
  }, [isGif, audioUrl, isMuted, ready]);

  if (loading) {
    return (
      <div className="flex items-center justify-center w-full h-full">
        <div className="text-white/50 text-sm">Loading video...</div>
      </div>
    );
  }

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

// ─── Exported component: picks mpv on Linux, HTML5 otherwise ────────────────

export function VideoSlide(props: Props) {
  if (isLinux) {
    return <MpvVideoSlide item={props.item} audioUrl={props.audioUrl} isGif={props.isGif} />;
  }
  return <Html5VideoSlide {...props} />;
}
