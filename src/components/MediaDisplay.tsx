import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MediaPost } from "../types";
import { ImageSlide } from "./ImageSlide";
import { VideoSlide } from "./VideoSlide";
import { GallerySlide } from "./GallerySlide";
import { EmbedSlide } from "./EmbedSlide";
import { ZoomPanState } from "../hooks/useZoomPan";

interface Props {
  post: MediaPost;
  rotation?: number;
  zoomPan?: ZoomPanState;
}

export function MediaDisplay({ post, rotation = 0, zoomPan }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [videoReady, setVideoReady] = useState(false);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [post.id]);

  useEffect(() => {
    const url = post.media[0]?.url || post.embed_url || "(none)";
    console.log(`[slide] id=${post.id} type=${post.media_type} sub=${post.subreddit} title="${post.title.slice(0, 60)}" url=${url}`);
    setVideoReady(false);
  }, [post.id]);

  // Show video element once it has data to display
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const show = () => setVideoReady(true);
    video.addEventListener("loadeddata", show);
    return () => video.removeEventListener("loadeddata", show);
  }, [post.id]);

  const isVideo = post.media_type === "video" || post.media_type === "animated_gif";

  if (isVideo) {
    const isRotated = rotation % 180 !== 0;
    const { w, h } = containerSize;
    // Give the <video> an explicit layout box whose dimensions, AFTER the
    // CSS rotate transform, exactly equal the container. When rotated 90°/270°
    // we swap width/height so the visual bounding box still matches.
    // object-contain then fits the video content inside that box without
    // distortion, achieving maximum fit for any orientation.
    const boxW = w && h ? (isRotated ? h : w) : undefined;
    const boxH = w && h ? (isRotated ? w : h) : undefined;
    const zpScale = zoomPan?.scale ?? 1;
    const zpTx = zoomPan?.translateX ?? 0;
    const zpTy = zoomPan?.translateY ?? 0;

    return (
      <>
        <div
          ref={(el) => {
            (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
            zoomPan?.setContainer(el);
          }}
          className="flex items-center justify-center w-full h-full overflow-hidden pb-10"
          style={{ cursor: zoomPan?.cursor }}
          onMouseDown={zoomPan?.onMouseDown}
        >
          <video
            ref={videoRef}
            style={{
              width: boxW ? `${boxW}px` : "100%",
              height: boxH ? `${boxH}px` : "100%",
              objectFit: "contain",
              transform: `translate(${zpTx}px, ${zpTy}px) scale(${zpScale}) rotate(${rotation}deg)`,
              flexShrink: 0,
              visibility: videoReady ? "visible" : "hidden",
            }}
            playsInline
          />
          <audio ref={audioRef} preload="auto" loop />
        </div>
        <VideoSlide
          item={post.media[0]}
          audioUrl={post.media_type === "video" ? post.audio_url : null}
          isGif={post.media_type === "animated_gif"}
          rotation={rotation}
          videoRef={videoRef}
          audioRef={audioRef}
        />
      </>
    );
  }

  if (post.media_type === "embed" && post.embed_url) {
    return <EmbedSlide embedUrl={post.embed_url} />;
  }

  const zpScale = zoomPan?.scale ?? 1;
  const zpTx = zoomPan?.translateX ?? 0;
  const zpTy = zoomPan?.translateY ?? 0;

  return (
    <div
      ref={(el) => zoomPan?.setContainer(el)}
      className="flex items-center justify-center w-full h-full overflow-hidden"
      style={{ cursor: zoomPan?.cursor }}
      onMouseDown={zoomPan?.onMouseDown}
      onDoubleClick={zoomPan?.onDoubleClick}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          transform: `translate(${zpTx}px, ${zpTy}px) scale(${zpScale})`,
          transformOrigin: "center center",
        }}
      >
        {post.media_type === "image" && <ImageSlide item={post.media[0]} />}
        {post.media_type === "gallery" && <GallerySlide items={post.media} />}
      </div>
    </div>
  );
}
