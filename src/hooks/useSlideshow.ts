import { useEffect, useContext, useCallback } from "react";
import { invoke } from "../invoke";
import { AppStateContext, AppDispatchContext } from "../state/context";
import { useReddit } from "./useReddit";

export function useSlideshow() {
  const state = useContext(AppStateContext);
  const dispatch = useContext(AppDispatchContext);
  const { fetchPosts } = useReddit();

  const currentPost = state.posts[state.currentIndex] ?? null;

  // Prefetch when nearing end
  useEffect(() => {
    if (
      state.posts.length > 0 &&
      state.currentIndex >= state.posts.length - 5 &&
      state.after &&
      !state.isLoading
    ) {
      fetchPosts(undefined, true);
    }
  }, [state.currentIndex, state.posts.length, state.after, state.isLoading, fetchPosts]);

  // Build a fingerprint of upcoming posts' types/URLs so preloading re-runs
  // when UPDATE_POSTS converts pending embeds to video
  const upcomingKey = (() => {
    const parts: string[] = [];
    let count = 0;
    for (let i = state.currentIndex + 1; i < state.posts.length && count < 3; i++) {
      const p = state.posts[i];
      if (state.mediaFilter !== "all") {
        const isPhoto = p.media_type === "image" || p.media_type === "gallery";
        const matches = state.mediaFilter === "photos" ? isPhoto : !isPhoto;
        if (!matches) continue;
      }
      count++;
      parts.push(`${p.id}:${p.media_type}:${p.media[0]?.url ?? ""}`);
    }
    return parts.join("|");
  })();

  useEffect(() => {
    const posts = state.posts;
    const filter = state.mediaFilter;
    let preloaded = 0;
    for (let i = state.currentIndex + 1; i < posts.length && preloaded < 3; i++) {
      const post = posts[i];
      if (filter !== "all") {
        const isPhoto = post.media_type === "image" || post.media_type === "gallery";
        const matches = filter === "photos" ? isPhoto : !isPhoto;
        if (!matches) continue;
      }
      preloaded++;
      if ((post.media_type === "image" || post.media_type === "gallery") && post.media.length > 0) {
        for (const item of post.media) {
          const img = new Image();
          img.src = item.url;
        }
      } else if ((post.media_type === "video" || post.media_type === "animated_gif") && post.media[0]) {
        invoke("preload_video", { url: post.media[0].url }).catch(() => {});
        if (post.audio_url) {
          invoke("preload_video", { url: post.audio_url }).catch(() => {});
        }
      }
    }
  }, [state.currentIndex, state.mediaFilter, upcomingKey]);

  const togglePlay = useCallback(() => {
    dispatch({ type: "TOGGLE_PLAY" });
  }, [dispatch]);

  return { currentPost, togglePlay };
}
