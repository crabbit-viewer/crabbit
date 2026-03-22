import { useEffect } from "react";
import { MediaPost } from "../types";
import { ImageSlide } from "./ImageSlide";
import { VideoSlide } from "./VideoSlide";
import { GallerySlide } from "./GallerySlide";
import { EmbedSlide } from "./EmbedSlide";

interface Props {
  post: MediaPost;
}

export function MediaDisplay({ post }: Props) {
  useEffect(() => {
    const url = post.media[0]?.url || post.embed_url || "(none)";
    console.log(`[slide] id=${post.id} type=${post.media_type} sub=${post.subreddit} title="${post.title.slice(0, 60)}" url=${url}`);
  }, [post.id]);

  switch (post.media_type) {
    case "image":
      return <ImageSlide item={post.media[0]} />;
    case "video":
      return (
        <VideoSlide
          item={post.media[0]}
          audioUrl={post.audio_url}
          isGif={false}
        />
      );
    case "animated_gif":
      return (
        <VideoSlide item={post.media[0]} audioUrl={null} isGif={true} />
      );
    case "gallery":
      return <GallerySlide items={post.media} />;
    case "embed":
      return post.embed_url ? <EmbedSlide embedUrl={post.embed_url} /> : null;
    default:
      return null;
  }
}
