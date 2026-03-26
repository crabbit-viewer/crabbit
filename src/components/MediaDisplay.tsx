import { useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { MediaPost } from "../types";
import { ImageSlide } from "./ImageSlide";
import { VideoSlide } from "./VideoSlide";
import { GallerySlide } from "./GallerySlide";
import { EmbedSlide } from "./EmbedSlide";
import { isLinux } from "../platform";

interface Props {
  post: MediaPost;
}

export function MediaDisplay({ post }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const url = post.media[0]?.url || post.embed_url || "(none)";
    console.log(`[slide] id=${post.id} type=${post.media_type} sub=${post.subreddit} title="${post.title.slice(0, 60)}" url=${url}`);
  }, [post.id]);

  // Report video container bounds to Rust for mpv overlay positioning
  const reportBounds = useCallback(() => {
    if (!isLinux || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    invoke("mpv_reposition", {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isLinux || !containerRef.current) return;
    reportBounds();
    const observer = new ResizeObserver(reportBounds);
    observer.observe(containerRef.current);
    const onFullscreen = () => setTimeout(reportBounds, 100);
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => {
      observer.disconnect();
      document.removeEventListener("fullscreenchange", onFullscreen);
    };
  }, [reportBounds, post.id]);

  // Hide mpv overlay when dropdowns/popovers are open (they render behind the overlay)
  useEffect(() => {
    if (!isLinux) return;
    const observer = new MutationObserver(() => {
      const hasPopover = document.querySelector(".z-20") !== null;
      invoke("mpv_set_overlay_visible", { visible: !hasPopover }).catch(() => {});
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const isVideo = post.media_type === "video" || post.media_type === "animated_gif";

  if (isVideo) {
    if (isLinux) {
      return (
        <>
          {/* Offset from bars: top-10 = SubredditBar (40px), bottom-12 = ControlBar+PostOverlay (48px) */}
          <div ref={containerRef} className="absolute inset-0 top-10 bottom-12 bg-black" />
          <VideoSlide
            item={post.media[0]}
            audioUrl={post.media_type === "video" ? post.audio_url : null}
            isGif={post.media_type === "animated_gif"}
            videoRef={videoRef}
            audioRef={audioRef}
          />
        </>
      );
    }

    return (
      <>
        <div className="flex items-center justify-center w-full h-full">
          <video
            ref={videoRef}
            className="max-w-full max-h-full object-contain"
            playsInline
          />
          <audio ref={audioRef} preload="auto" loop />
        </div>
        <VideoSlide
          item={post.media[0]}
          audioUrl={post.media_type === "video" ? post.audio_url : null}
          isGif={post.media_type === "animated_gif"}
          videoRef={videoRef}
          audioRef={audioRef}
        />
      </>
    );
  }

  return (
    <>
      {post.media_type === "image" && <ImageSlide item={post.media[0]} />}
      {post.media_type === "gallery" && <GallerySlide items={post.media} />}
      {post.media_type === "embed" && post.embed_url && <EmbedSlide embedUrl={post.embed_url} />}
    </>
  );
}
