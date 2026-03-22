import { useContext, useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AppStateContext, AppDispatchContext } from "../state/context";

interface Props {
  onNext: () => void;
  onPrev: () => void;
  onTogglePlay: () => void;
  onSave: () => void;
  onDelete?: () => void;
  uiVisible: boolean;
}

export function ControlBar({ onNext, onPrev, onTogglePlay, onSave, onDelete, uiVisible }: Props) {
  const state = useContext(AppStateContext);
  const dispatch = useContext(AppDispatchContext);
  const [isFavorite, setIsFavorite] = useState(false);

  const currentPost = state.posts[state.currentIndex];
  const isSavedMode = state.viewMode === "saved";
  const isEmbed = currentPost?.media_type === "embed";
  const chromeClass = `ui-chrome ui-bottom ${uiVisible ? "" : "ui-hidden"}`;

  useEffect(() => {
    if (!currentPost) return;
    if (isSavedMode) return;
    invoke<string[]>("get_favorites").then((favs) => {
      setIsFavorite(
        favs.some((f) => f.toLowerCase() === currentPost.subreddit.toLowerCase())
      );
    });
  }, [currentPost?.subreddit, isSavedMode]);

  useEffect(() => {
    if (!currentPost || isSavedMode) return;
    invoke<boolean>("is_post_saved", { postId: currentPost.id })
      .then((saved) => dispatch({ type: "SET_CURRENT_POST_SAVED", payload: saved }))
      .catch(() => {});
  }, [currentPost?.id, isSavedMode, dispatch]);

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
    <div className={`absolute bottom-0 left-0 right-0 h-10 bg-black/40 flex items-center px-3 gap-1 text-white ${chromeClass}`} data-ui-chrome>
      {/* Playback controls */}
      <button onClick={onPrev} className="icon-btn" title="Previous (←)">
        <svg viewBox="0 0 16 16" fill="currentColor"><path d="M3.5 3v10a.5.5 0 001 0V3a.5.5 0 00-1 0zm8.354.854a.5.5 0 00-.708-.708l-5 5a.5.5 0 000 .708l5 5a.5.5 0 00.708-.708L7.207 8l4.647-4.646z"/></svg>
      </button>
      <button onClick={onTogglePlay} className="icon-btn" title="Play/Pause (Space)">
        {state.isPlaying ? (
          <svg viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 3.5A1.5 1.5 0 017 5v6a1.5 1.5 0 01-3 0V5a1.5 1.5 0 011.5-1.5zm5 0A1.5 1.5 0 0112 5v6a1.5 1.5 0 01-3 0V5a1.5 1.5 0 011.5-1.5z"/></svg>
        ) : (
          <svg viewBox="0 0 16 16" fill="currentColor"><path d="M4 3.804v8.392a.5.5 0 00.758.429l7.097-4.196a.5.5 0 000-.858L4.758 3.375A.5.5 0 004 3.804z"/></svg>
        )}
      </button>
      <button onClick={onNext} className="icon-btn" title="Next (→)">
        <svg viewBox="0 0 16 16" fill="currentColor"><path d="M12.5 3v10a.5.5 0 01-1 0V3a.5.5 0 011 0zM4.146 3.146a.5.5 0 01.708 0l5 5a.5.5 0 010 .708l-5 5a.5.5 0 01-.708-.708L8.793 8 4.146 3.354a.5.5 0 010-.708z"/></svg>
      </button>

      {/* Speed */}
      <button
        onClick={cycleSpeed}
        className="text-white/30 hover:text-white/60 text-[10px] ml-1 tabular-nums transition-colors"
        title="Timer speed"
      >
        {state.timerSpeed / 1000}s
      </button>

      {/* Counter */}
      <span className="text-white/20 text-[10px] ml-auto tabular-nums select-none">
        {state.posts.length > 0
          ? `${state.currentIndex + 1}/${state.posts.length}`
          : ""}
      </span>

      {/* Volume */}
      <button
        onClick={() => dispatch({ type: "TOGGLE_MUTE" })}
        className={`icon-btn ${state.isMuted ? "active" : ""}`}
        title="Mute (M)"
      >
        {state.isMuted ? (
          <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z" clipRule="evenodd"/></svg>
        ) : (
          <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clipRule="evenodd"/></svg>
        )}
      </button>

      {/* Save / Favorite / Delete */}
      {isSavedMode && onDelete ? (
        <button
          onClick={onDelete}
          className="icon-btn hover:!text-red-400"
          title="Delete saved post"
        >
          <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
        </button>
      ) : (
        <>
          <button
            onClick={onSave}
            className={`icon-btn ${state.currentPostSaved ? "active" : ""} ${isEmbed ? "opacity-20 cursor-not-allowed" : ""}`}
            title={isEmbed ? "Embeds cannot be saved" : "Save post (F)"}
            disabled={isEmbed}
          >
            <svg viewBox="0 0 20 20" fill="currentColor"><path d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"/></svg>
          </button>
          <button
            onClick={toggleFavorite}
            className={`icon-btn ${isFavorite ? "!text-yellow-500" : ""}`}
            title="Favorite subreddit"
          >
            {isFavorite ? (
              <svg viewBox="0 0 20 20" fill="currentColor"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
            ) : (
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
            )}
          </button>
        </>
      )}
    </div>
  );
}
