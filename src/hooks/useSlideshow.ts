import { useEffect, useContext, useCallback, useRef } from "react";
import { AppStateContext, AppDispatchContext } from "../state/context";
import { useReddit } from "./useReddit";

export function useSlideshow() {
  const state = useContext(AppStateContext);
  const dispatch = useContext(AppDispatchContext);
  const { fetchPosts } = useReddit();
  const timerRef = useRef<number | null>(null);

  const currentPost = state.posts[state.currentIndex] ?? null;

  // Auto-advance timer
  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (
      state.isPlaying &&
      state.posts.length > 0 &&
      currentPost?.media_type !== "embed"
    ) {
      timerRef.current = window.setInterval(() => {
        dispatch({ type: "NEXT_SLIDE" });
      }, state.timerSpeed);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [
    state.isPlaying,
    state.timerSpeed,
    state.posts.length,
    currentPost?.media_type,
    dispatch,
  ]);

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

  // Preload next images
  useEffect(() => {
    for (let i = 1; i <= 3; i++) {
      const post = state.posts[state.currentIndex + i];
      if (post && post.media_type === "image" && post.media[0]) {
        const img = new Image();
        img.src = post.media[0].url;
      }
    }
  }, [state.currentIndex, state.posts]);

  const next = useCallback(() => {
    dispatch({ type: "NEXT_SLIDE" });
  }, [dispatch]);

  const prev = useCallback(() => {
    dispatch({ type: "PREV_SLIDE" });
  }, [dispatch]);

  const togglePlay = useCallback(() => {
    dispatch({ type: "TOGGLE_PLAY" });
  }, [dispatch]);

  return { currentPost, next, prev, togglePlay };
}
