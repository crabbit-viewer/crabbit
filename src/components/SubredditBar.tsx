import { useState, useContext, useEffect, useRef, useCallback, FormEvent } from "react";
import { invoke } from "../invoke";
import { AppStateContext, AppDispatchContext } from "../state/context";
import { MediaFilter, SortOption, TimeRange } from "../types";
import { useReddit } from "../hooks/useReddit";
import { useSavedPosts } from "../hooks/useSavedPosts";
import { useClickOutside } from "../hooks/useClickOutside";

function Dropdown({ value, options, onChange }: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const label = options.find((o) => o.value === value)?.label ?? value;

  useClickOutside(ref, useCallback(() => setOpen(false), []));

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="pill-segment flex items-center gap-0.5"
      >
        {label}
        <svg className="w-3 h-3 opacity-40" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4.5 6l3.5 4 3.5-4z" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 dropdown-panel min-w-[110px] z-20 py-1">
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`block w-full text-left px-3 py-1.5 text-xs transition-colors ${
                opt.value === value ? "text-[var(--accent)]" : "text-white/60 hover:text-white hover:bg-white/5"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface SubredditBarProps {
  uiVisible: boolean;
}

export function SubredditBar({ uiVisible }: SubredditBarProps) {
  const state = useContext(AppStateContext);
  const dispatch = useContext(AppDispatchContext);
  const { fetchPosts } = useReddit();
  const { loadSavedPosts, exitSavedView } = useSavedPosts();
  const [input, setInput] = useState(state.subreddit);

  const currentPost = state.posts[state.currentIndex] ?? null;
  const isSavedMode = state.viewMode === "saved";
  const chromeClass = `ui-chrome ui-top ${uiVisible ? "" : "ui-hidden"}`;

  useEffect(() => {
    invoke<{ sort: string; time_range: string }>("get_sort_preference")
      .then((pref) => {
        dispatch({ type: "SET_SORT", payload: pref.sort as SortOption });
        dispatch({ type: "SET_TIME_RANGE", payload: pref.time_range as TimeRange });
      })
      .catch(() => {});
  }, []);

  const isUserBrowse = state.subreddit.startsWith("user/");

  useEffect(() => {
    setInput(isUserBrowse ? state.subreddit.slice(5) : state.subreddit);
  }, [state.subreddit, isUserBrowse]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    let sub = input.trim();
    if (!sub) return;
    if (sub.startsWith("u/")) {
      sub = `user/${sub.slice(2)}`;
    }
    dispatch({ type: "SET_PLAYING", payload: false });
    fetchPosts(sub);
  };

  const handleSortChange = (sort: string) => {
    dispatch({ type: "SET_SORT", payload: sort as SortOption });
    dispatch({ type: "SET_PLAYING", payload: false });
    invoke("set_sort_preference", { sort, time_range: state.timeRange }).catch(() => {});
  };

  const handleTimeChange = (time: string) => {
    dispatch({ type: "SET_TIME_RANGE", payload: time as TimeRange });
    dispatch({ type: "SET_PLAYING", payload: false });
    invoke("set_sort_preference", { sort: state.sort, time_range: time }).catch(() => {});
  };

  const sortTimeRef = useRef({ sort: state.sort, timeRange: state.timeRange });
  useEffect(() => {
    // Skip if sort/timeRange haven't actually changed (e.g. initial preference load)
    if (sortTimeRef.current.sort === state.sort && sortTimeRef.current.timeRange === state.timeRange) return;
    sortTimeRef.current = { sort: state.sort, timeRange: state.timeRange };
    if (state.subreddit && state.posts.length > 0 && !isSavedMode) {
      fetchPosts();
    }
  }, [state.sort, state.timeRange]);

  const showTimeRange = state.sort === "top" || state.sort === "controversial";

  if (isSavedMode) {
    return (
      <div className={`absolute top-0 left-0 right-0 h-11 flex items-center px-4 gap-3 z-10 ${chromeClass}`} style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)" }} data-ui-chrome>
        <span className="text-white/20 font-semibold text-sm tracking-tight">crabbit</span>
        <div className="w-px h-5 bg-white/[0.08]" />
        <span className="text-[var(--accent)] text-xs font-medium">Saved</span>
        <button
          onClick={() => dispatch({
            type: "SET_SAVED_DISPLAY_MODE",
            payload: state.savedDisplayMode === "grid" ? "slideshow" : "grid",
          })}
          className="icon-btn text-white/40 hover:text-white transition-colors"
          title={state.savedDisplayMode === "grid" ? "Slideshow view" : "Grid view"}
        >
          {state.savedDisplayMode === "grid" ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
          )}
        </button>
        <button
          onClick={exitSavedView}
          className="text-white/40 hover:text-white text-xs ml-auto transition-colors"
        >
          Back
        </button>
        <button
          onClick={() => dispatch({ type: "TOGGLE_SIDEBAR" })}
          className="icon-btn"
          title="Menu"
        >
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className={`absolute top-0 left-0 right-0 h-11 flex items-center px-4 gap-3 z-10 ${chromeClass}`} style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)" }} data-ui-chrome>
      {/* Logo */}
      <button
        onClick={() => {
          dispatch({ type: "SET_SUBREDDIT", payload: "" });
          dispatch({ type: "SET_POSTS", payload: { posts: [], after: null } });
          dispatch({ type: "SET_PLAYING", payload: false });
          setInput("");
        }}
        className="text-white/20 hover:text-white/40 font-semibold text-sm tracking-tight transition-colors"
        title="Home"
      >
        crabbit
      </button>

      <div className="w-px h-5 bg-white/[0.08]" />

      {/* Subreddit input — pill shape */}
      <form onSubmit={handleSubmit} className="flex items-center bg-white/[0.04] rounded-lg border border-white/[0.08] focus-within:border-[var(--accent)]/30 transition-colors">
        <span className="text-white/20 text-xs pl-2.5">{isUserBrowse ? "u/" : "r/"}</span>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="subreddit or u/user"
          className="bg-transparent text-white/80 text-xs w-40 outline-none px-1 py-1.5 placeholder:text-white/15"
        />
        <button
          type="submit"
          className="icon-btn w-7 h-7 mr-0.5"
          title="Go"
        >
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
            <path d="M6.5 1a5.5 5.5 0 014.383 8.823l3.147 3.147a.75.75 0 01-1.06 1.06l-3.147-3.147A5.5 5.5 0 116.5 1zm0 1.5a4 4 0 100 8 4 4 0 000-8z" />
          </svg>
        </button>
      </form>

      {/* Sort / Time / Filter — pill group */}
      <div className="pill-group">
        <Dropdown
          value={state.sort}
          options={
            isUserBrowse
              ? [
                  { value: "hot", label: "Hot" },
                  { value: "new", label: "New" },
                  { value: "top", label: "Top" },
                  { value: "controversial", label: "Controversial" },
                ]
              : [
                  { value: "hot", label: "Hot" },
                  { value: "new", label: "New" },
                  { value: "top", label: "Top" },
                  { value: "rising", label: "Rising" },
                  { value: "controversial", label: "Controversial" },
                ]
          }
          onChange={handleSortChange}
        />

        {showTimeRange && (
          <Dropdown
            value={state.timeRange}
            options={[
              { value: "hour", label: "Hour" },
              { value: "day", label: "Day" },
              { value: "week", label: "Week" },
              { value: "month", label: "Month" },
              { value: "year", label: "Year" },
              { value: "all", label: "All Time" },
            ]}
            onChange={handleTimeChange}
          />
        )}

        {state.posts.length > 0 && (
          <Dropdown
            value={state.mediaFilter}
            options={[
              { value: "all", label: "All" },
              { value: "photos", label: "Photos" },
              { value: "animated", label: "Animated" },
            ]}
            onChange={(v) => dispatch({ type: "SET_MEDIA_FILTER", payload: v as MediaFilter })}
          />
        )}
      </div>

      {/* Post metadata */}
      {state.showOverlay && currentPost && (
        <div className="flex items-center gap-2 min-w-0 overflow-hidden flex-1">
          <div className="w-px h-4 bg-white/[0.08] flex-shrink-0" />
          <p className="text-white/50 text-xs truncate" title={currentPost.title}>
            {currentPost.title}
          </p>
          <span className="text-white/20 text-[10px] flex-shrink-0 whitespace-nowrap">
            u/{currentPost.author} · {formatScore(currentPost.score)}
          </span>
        </div>
      )}

      {/* Right side actions */}
      <div className="ml-auto flex items-center gap-1">
        <button
          onClick={loadSavedPosts}
          className="icon-btn"
          title="Saved posts"
        >
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" />
          </svg>
        </button>

        <button
          onClick={() => dispatch({ type: "TOGGLE_SIDEBAR" })}
          className="icon-btn"
          title="Menu"
        >
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function formatScore(score: number): string {
  if (score >= 1000) return (score / 1000).toFixed(1) + "k";
  return String(score);
}
