import { useEffect, useRef } from "react";
import { MediaPost } from "../types";
import { ImageSlide } from "./ImageSlide";
import { VideoSlide } from "./VideoSlide";
import { GallerySlide } from "./GallerySlide";
import { EmbedSlide } from "./EmbedSlide";

interface Props {
  post: MediaPost;
}

export function MediaDisplay({ post }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const url = post.media[0]?.url || post.embed_url || "(none)";
    console.log(`[slide] id=${post.id} type=${post.media_type} sub=${post.subreddit} title="${post.title.slice(0, 60)}" url=${url}`);
  }, [post.id]);

  const isVideo = post.media_type === "video" || post.media_type === "animated_gif";

  if (isVideo) {
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
