import { useEffect, useContext, useCallback } from "react";
import { invoke } from "../invoke";
import { AppStateContext, AppDispatchContext } from "../state/context";

export function useKeyboard(
  next: () => void,
  prev: () => void,
  togglePlay: () => void,
  savePost: () => void
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
        case "d":
        case "D":
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
        case "a":
        case "A":
          if (
            currentPost?.media_type === "gallery" &&
            state.galleryIndex > 0
          ) {
            dispatch({ type: "PREV_GALLERY" });
          } else {
            prev();
          }
          break;
        case "ArrowUp":
        case "w":
        case "W":
          e.preventDefault();
          dispatch({ type: "SET_VOLUME", payload: state.volume + 10 });
          break;
        case "ArrowDown":
        case "s":
        case "S":
          e.preventDefault();
          dispatch({ type: "SET_VOLUME", payload: state.volume - 10 });
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
          // Save post (no shift)
          savePost();
          break;
        case "F":
          // Fullscreen (shift held)
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
        case "r":
        case "R": {
          if (!currentPost?.permalink) break;
          const redditUrl = currentPost.permalink.startsWith("http")
            ? currentPost.permalink
            : `https://www.reddit.com${currentPost.permalink}`;
          window.open(redditUrl, "_blank");
          break;
        }
        case "`":
          invoke("dump_video_cache").then((paths) => {
            console.log("[dump]", paths);
            alert(`Dumped ${(paths as string[]).length} videos to /tmp`);
          }).catch((e) => alert(`Dump failed: ${e}`));
          break;
        case "F12":
          e.preventDefault();
          invoke("toggle_devtools").catch(() => {});
          break;
      }
    },
    [next, prev, togglePlay, savePost, dispatch, currentPost, state.galleryIndex, state.volume]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
