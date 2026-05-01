import { useEffect, useContext, useCallback, useRef } from "react";
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

  const postsRef = useRef(state.posts);
  postsRef.current = state.posts;

  useEffect(() => {
    const posts = postsRef.current;
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
  }, [state.currentIndex, state.mediaFilter]);

  const togglePlay = useCallback(() => {
    dispatch({ type: "TOGGLE_PLAY" });
  }, [dispatch]);

  return { currentPost, togglePlay };
}
