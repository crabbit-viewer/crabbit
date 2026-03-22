import { useContext, useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AppStateContext, AppDispatchContext } from "../state/context";

interface Props {
  onNext: () => void;
  onPrev: () => void;
  onTogglePlay: () => void;
}

export function ControlBar({ onNext, onPrev, onTogglePlay }: Props) {
  const state = useContext(AppStateContext);
  const dispatch = useContext(AppDispatchContext);
  const [isFavorite, setIsFavorite] = useState(false);

  const currentPost = state.posts[state.currentIndex];

  useEffect(() => {
    if (!currentPost) return;
    invoke<string[]>("get_favorites").then((favs) => {
      setIsFavorite(
        favs.some(
          (f) => f.toLowerCase() === currentPost.subreddit.toLowerCase()
        )
      );
    });
  }, [currentPost?.subreddit]);

  const toggleFavorite = useCallback(async () => {
    if (!currentPost) return;
    const sub = currentPost.subreddit;
    if (isFavorite) {
      await invoke("remove_favorite", { subreddit: sub });
      setIsFavorite(false);
    } else {
      await invoke("add_favorite", { subreddit: sub });
      setIsFavorite(true);
    }
  }, [currentPost, isFavorite]);

  const speeds = [3000, 5000, 8000, 12000];
  const cycleSpeed = () => {
    const idx = speeds.indexOf(state.timerSpeed);
    const next = speeds[(idx + 1) % speeds.length];
    dispatch({ type: "SET_SPEED", payload: next });
  };

  return (
    <div className="absolute bottom-0 left-0 right-0 h-12 bg-black/70 flex items-center px-4 gap-3 text-white text-sm">
      <button onClick={onPrev} className="hover:text-blue-400" title="Previous">
        ◀
      </button>
      <button onClick={onTogglePlay} className="hover:text-blue-400 w-6" title="Play/Pause">
        {state.isPlaying ? "⏸" : "▶"}
      </button>
      <button onClick={onNext} className="hover:text-blue-400" title="Next">
        ▶
      </button>

      <button
        onClick={cycleSpeed}
        className="hover:text-blue-400 ml-2"
        title="Timer speed"
      >
        {state.timerSpeed / 1000}s
      </button>

      <span className="text-white/50 ml-auto">
        {state.posts.length > 0
          ? `${state.currentIndex + 1} / ${state.posts.length}`
          : "—"}
      </span>

      <button
        onClick={() => dispatch({ type: "TOGGLE_MUTE" })}
        className="hover:text-blue-400"
        title="Mute/unmute"
      >
        {state.isMuted ? "🔇" : "🔊"}
      </button>
      <span className="text-white/50 text-xs w-8">{state.volume}%</span>

      <button
        onClick={toggleFavorite}
        className={`hover:text-yellow-400 ${isFavorite ? "text-yellow-400" : ""}`}
        title="Favorite subreddit"
      >
        {isFavorite ? "★" : "☆"}
      </button>
    </div>
  );
}
