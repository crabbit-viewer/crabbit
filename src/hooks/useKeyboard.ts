import { useEffect, useContext, useCallback } from "react";
import { AppStateContext, AppDispatchContext } from "../state/context";

export function useKeyboard(
  next: () => void,
  prev: () => void,
  togglePlay: () => void
) {
  const state = useContext(AppStateContext);
  const dispatch = useContext(AppDispatchContext);
  const currentPost = state.posts[state.currentIndex];

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't handle keys when typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      switch (e.key) {
        case "ArrowRight":
          if (
            currentPost?.media_type === "gallery" &&
            state.galleryIndex < currentPost.media.length - 1
          ) {
            dispatch({ type: "NEXT_GALLERY" });
          } else {
            next();
          }
          break;
        case "ArrowLeft":
          if (
            currentPost?.media_type === "gallery" &&
            state.galleryIndex > 0
          ) {
            dispatch({ type: "PREV_GALLERY" });
          } else {
            prev();
          }
          break;
        case " ":
          e.preventDefault();
          togglePlay();
          break;
        case "t":
        case "T":
          dispatch({ type: "TOGGLE_OVERLAY" });
          break;
        case "f":
        case "F":
          if (document.fullscreenElement) {
            document.exitFullscreen();
          } else {
            document.documentElement.requestFullscreen();
          }
          break;
        case "m":
        case "M":
          dispatch({ type: "TOGGLE_MUTE" });
          break;
        case "Escape":
          if (document.fullscreenElement) {
            document.exitFullscreen();
          }
          break;
      }
    },
    [next, prev, togglePlay, dispatch, currentPost, state.galleryIndex]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
