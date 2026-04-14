import { useContext, useCallback, useEffect, useState } from "react";
import { invoke } from "../invoke";
import { AppStateContext, AppDispatchContext } from "../state/context";
import { useReddit } from "../hooks/useReddit";

interface Props {
  onNext: () => void;
  onPrev: () => void;
  onTogglePlay: () => void;
  onSave: () => void;
  onDelete?: () => void;
  onRotate: () => void;
  showRotate: boolean;
  uiVisible: boolean;
}

export function ControlBar({ onNext, onPrev, onTogglePlay, onSave, onDelete, onRotate, showRotate, uiVisible }: Props) {
  const state = useContext(AppStateContext);
  const dispatch = useContext(AppDispatchContext);
  const { fetchPosts } = useReddit();
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

  const ignoreUser = useCallback(async () => {
    if (!currentPost || !currentPost.author) return;
    const author = currentPost.author;
    await invoke("add_ignored_user", { username: author });
    dispatch({ type: "REMOVE_POSTS_BY_AUTHOR", payload: author });
    dispatch({
      type: "SET_NOTIFICATION",
      payload: { message: `Ignored u/${author}`, type: "success" },
    });
  }, [currentPost, dispatch]);

  const browseUser = useCallback(() => {
    if (!currentPost?.author || currentPost.author === "[deleted]") return;
    dispatch({ type: "SET_PLAYING", payload: false });
    fetchPosts(`user/${currentPost.author}`);
  }, [currentPost, dispatch, fetchPosts]);

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

      <button
        onClick={cycleSpeed}
        className="text-white/30 hover:text-white/60 text-[10px] ml-1 tabular-nums transition-colors"
        title="Timer speed"
      >
        {state.timerSpeed / 1000}s
      </button>

      <span className="text-white/20 text-[10px] ml-auto tabular-nums select-none">
        {state.posts.length > 0
          ? `${state.currentIndex + 1}/${state.posts.length}`
          : ""}
      </span>

      <button
        onClick={() => {
          if (currentPost?.permalink) {
            const url = currentPost.permalink.startsWith("http")
              ? currentPost.permalink
              : `https://www.reddit.com${currentPost.permalink}`;
            window.open(url, "_blank");
          }
        }}
        className="icon-btn"
        title="Open on Reddit (I)"
      >
        <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.083 9h1.946c.089-1.546.383-2.97.837-4.118A6.004 6.004 0 004.083 9zM10 2a8 8 0 100 16 8 8 0 000-16zm0 2c-.076 0-.232.032-.465.262-.238.234-.497.623-.737 1.182-.389.907-.673 2.142-.766 3.556h3.936c-.093-1.414-.377-2.649-.766-3.556-.24-.56-.5-.948-.737-1.182C10.232 4.032 10.076 4 10 4zm3.971 5c-.089-1.546-.383-2.97-.837-4.118A6.004 6.004 0 0115.917 9h-1.946zm-2.003 2H8.032c.093 1.414.377 2.649.766 3.556.24.56.5.948.737 1.182.233.23.389.262.465.262.076 0 .232-.032.465-.262.238-.234.497-.623.737-1.182.389-.907.673-2.142.766-3.556zm1.166 4.118c.454-1.147.748-2.572.837-4.118h1.946a6.004 6.004 0 01-2.783 4.118zm-6.268 0C6.412 13.97 6.118 12.546 6.03 11H4.083a6.004 6.004 0 002.783 4.118z" clipRule="evenodd"/></svg>
      </button>

      {showRotate && (
        <button
          onClick={onRotate}
          className="icon-btn"
          title="Rotate video 90° counter-clockwise (R)"
        >
          <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.793 2.232a1 1 0 010 1.415L6.44 5H11a6 6 0 016 6v1a1 1 0 11-2 0v-1a4 4 0 00-4-4H6.44l1.353 1.354a1 1 0 11-1.415 1.414L3.025 6.414a1 1 0 010-1.414l3.353-3.354a1 1 0 011.415 0zM4 12a1 1 0 011 1v4a1 1 0 11-2 0v-4a1 1 0 011-1z" clipRule="evenodd"/></svg>
        </button>
      )}

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
            onClick={ignoreUser}
            className="icon-btn"
            title="Ignore user"
          >
            <svg viewBox="0 0 20 20" fill="currentColor"><path d="M13.477 14.89A6 6 0 015.11 6.524l8.367 8.368zm1.414-1.414L6.524 5.11a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z" fillRule="evenodd" clipRule="evenodd"/></svg>
          </button>
          <button
            onClick={browseUser}
            className="icon-btn"
            title={`Browse u/${currentPost?.author ?? ""}`}
          >
            <svg viewBox="0 0 20 20" fill="currentColor"><path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" fillRule="evenodd" clipRule="evenodd"/><path d="M15.5 9.5l2.5 2.5m0-2.5l-2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/></svg>
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
