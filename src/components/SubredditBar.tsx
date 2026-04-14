import { useState, useContext, useEffect, useRef, useCallback, FormEvent } from "react";
import { invoke } from "../invoke";
import { AppStateContext, AppDispatchContext } from "../state/context";
import { SortOption, TimeRange } from "../types";
import { useReddit } from "../hooks/useReddit";
import { useSavedPosts } from "../hooks/useSavedPosts";
import { useClickOutside } from "../hooks/useClickOutside";
import { SubredditAnalyzer } from "./SubredditAnalyzer";

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
        className="text-white/50 hover:text-white text-xs px-1.5 py-0.5 rounded transition-colors"
      >
        {label}
        <svg className="inline ml-0.5 w-3 h-3 opacity-50" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4.5 6l3.5 4 3.5-4z" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 bg-black/90 backdrop-blur-sm border border-white/10 rounded-lg shadow-2xl min-w-[110px] z-20 py-1">
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`block w-full text-left px-3 py-1.5 text-xs transition-colors ${
                opt.value === value ? "text-blue-400" : "text-white/60 hover:text-white hover:bg-white/5"
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

function SettingsPopover() {
  const [open, setOpen] = useState(false);
  const [savePath, setSavePath] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      invoke<string>("get_save_path").then(setSavePath).catch(() => {});
    }
  }, [open]);

  useClickOutside(ref, useCallback(() => setOpen(false), []));

  const pickFolder = async () => {
    try {
      const selected = await invoke<string | null>("show_open_dialog", {
        properties: ["openDirectory"],
        title: "Choose save folder",
      });
      if (selected) {
        await invoke("set_save_path", { path: selected });
        setSavePath(selected);
      }
    } catch (e) {
      console.error("Folder pick failed:", e);
    }
  };

  const openFolder = () => {
    invoke("open_save_folder").catch(() => {});
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="icon-btn"
        title="Settings"
      >
        <svg viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-black/90 backdrop-blur-sm border border-white/10 rounded-lg shadow-2xl p-3 z-20 min-w-[260px]">
          <div className="text-white/40 text-[10px] uppercase tracking-wider mb-1.5">Save location</div>
          <div className="text-white/70 text-xs break-all mb-3 leading-relaxed">{savePath || "..."}</div>
          <div className="flex gap-2">
            <button
              onClick={pickFolder}
              className="text-white/50 hover:text-white text-xs px-2.5 py-1 rounded border border-white/10 hover:border-white/20 transition-colors"
            >
              Change
            </button>
            <button
              onClick={openFolder}
              className="text-white/50 hover:text-white text-xs px-2.5 py-1 rounded border border-white/10 hover:border-white/20 transition-colors"
            >
              Open
            </button>
          </div>
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
  const [favorites, setFavorites] = useState<string[]>([]);
  const [showFavs, setShowFavs] = useState(false);
  const [ignoredUsers, setIgnoredUsers] = useState<string[]>([]);
  const [showIgnored, setShowIgnored] = useState(false);

  const currentPost = state.posts[state.currentIndex] ?? null;
  const isSavedMode = state.viewMode === "saved";
  const chromeClass = `ui-chrome ui-top ${uiVisible ? "" : "ui-hidden"}`;

  useEffect(() => {
    invoke<string[]>("get_favorites").then(setFavorites).catch(() => {});
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

  const loadFavorite = (sub: string) => {
    setInput(sub);
    setShowFavs(false);
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

  useEffect(() => {
    if (state.subreddit && state.posts.length > 0 && !isSavedMode) {
      fetchPosts();
    }
  }, [state.sort, state.timeRange]);

  if (isSavedMode) {
    return (
      <div className={`absolute top-0 left-0 right-0 h-10 bg-black/40 flex items-center px-4 gap-3 z-10 ${chromeClass}`} data-ui-chrome>
        <span className="text-white/30 font-medium text-sm tracking-tight">crabbit</span>
        <div className="w-px h-4 bg-white/10" />
        <span className="text-blue-400 text-xs">Saved</span>
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
        <SettingsPopover />
      </div>
    );
  }

  return (
    <div className={`absolute top-0 left-0 right-0 h-10 bg-black/40 flex items-center px-4 gap-2 z-10 ${chromeClass}`} data-ui-chrome>
      <button
        onClick={() => {
          dispatch({ type: "SET_SUBREDDIT", payload: "" });
          dispatch({ type: "SET_POSTS", payload: { posts: [], after: null } });
          dispatch({ type: "SET_PLAYING", payload: false });
          setInput("");
        }}
        className="text-white/30 hover:text-white/50 font-medium text-sm tracking-tight mr-1 transition-colors"
        title="Home"
      >
        crabbit
      </button>

      <form onSubmit={handleSubmit} className="flex items-center gap-0">
        <span className="text-white/25 text-xs">{isUserBrowse ? "u/" : "r/"}</span>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="subreddit or u/user"
          className="bg-transparent text-white/80 text-xs w-36 outline-none border-b border-white/10 focus:border-blue-500/50 px-1 py-0.5 transition-colors placeholder:text-white/20"
        />
        <button
          type="submit"
          className="icon-btn w-6 h-6"
          title="Go"
        >
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
            <path d="M6.5 1a5.5 5.5 0 014.383 8.823l3.147 3.147a.75.75 0 01-1.06 1.06l-3.147-3.147A5.5 5.5 0 116.5 1zm0 1.5a4 4 0 100 8 4 4 0 000-8z" />
          </svg>
        </button>
      </form>

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

      {(state.sort === "top" || state.sort === "controversial") && (
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

      {state.showOverlay && currentPost && (
        <div className="flex items-center gap-2 ml-2 min-w-0 overflow-hidden">
          <div className="w-px h-4 bg-white/10 flex-shrink-0" />
          <p className="text-white/60 text-xs truncate max-w-[400px]" title={currentPost.title}>
            {currentPost.title}
          </p>
          <span className="text-white/25 text-[10px] flex-shrink-0">
            u/{currentPost.author} · {formatScore(currentPost.score)}
          </span>
        </div>
      )}

      <div className="relative ml-auto flex items-center gap-1">
        <button
          onClick={async () => {
            if (state.isLoggedIn) {
              await invoke("reddit_logout");
              dispatch({ type: "SET_LOGGED_IN", payload: false });
            } else {
              const ok = await invoke<boolean>("reddit_login");
              if (ok) dispatch({ type: "SET_LOGGED_IN", payload: true });
            }
          }}
          className="icon-btn"
          title={state.isLoggedIn ? "Logged in — click to log out" : "Log in to Reddit"}
        >
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
          </svg>
          {state.isLoggedIn && (
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-400 rounded-full" />
          )}
        </button>

        <SubredditAnalyzer onOpen={() => { setShowFavs(false); setShowIgnored(false); }} />

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
          onClick={() => {
            setShowIgnored(!showIgnored);
            setShowFavs(false);
            invoke<string[]>("get_ignored_users").then(setIgnoredUsers).catch(() => {});
          }}
          className="icon-btn"
          title="Ignored users"
        >
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path d="M13.477 14.89A6 6 0 015.11 6.524l8.367 8.368zm1.414-1.414L6.524 5.11a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z" fillRule="evenodd" clipRule="evenodd"/>
          </svg>
        </button>
        {showIgnored && ignoredUsers.length > 0 && (
          <div className="absolute right-0 top-full mt-1 bg-black/90 backdrop-blur-sm border border-white/10 rounded-lg shadow-2xl min-w-[140px] z-20 py-1">
            {ignoredUsers.map((user) => (
              <div
                key={user}
                className="flex items-center justify-between px-3 py-1.5 text-xs text-white/50 hover:bg-white/5 transition-colors"
              >
                <span>u/{user}</span>
                <button
                  onClick={async () => {
                    await invoke("remove_ignored_user", { username: user });
                    setIgnoredUsers(ignoredUsers.filter((u) => u !== user));
                  }}
                  className="ml-2 text-white/30 hover:text-red-400 transition-colors"
                  title="Unignore"
                >
                  <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                    <path d="M4.646 4.646a.5.5 0 01.708 0L8 7.293l2.646-2.647a.5.5 0 01.708.708L8.707 8l2.647 2.646a.5.5 0 01-.708.708L8 8.707l-2.646 2.647a.5.5 0 01-.708-.708L7.293 8 4.646 5.354a.5.5 0 010-.708z"/>
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
        {showIgnored && ignoredUsers.length === 0 && (
          <div className="absolute right-0 top-full mt-1 bg-black/90 backdrop-blur-sm border border-white/10 rounded-lg shadow-2xl min-w-[140px] z-20 py-1">
            <div className="px-3 py-1.5 text-xs text-white/30">No ignored users</div>
          </div>
        )}

        <button
          onClick={() => {
            setShowFavs(!showFavs);
            setShowIgnored(false);
            invoke<string[]>("get_favorites").then(setFavorites).catch(() => {});
          }}
          className="icon-btn"
          title="Favorites"
        >
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        </button>
        {showFavs && favorites.length > 0 && (
          <div className="absolute right-0 top-full mt-1 bg-black/90 backdrop-blur-sm border border-white/10 rounded-lg shadow-2xl min-w-[140px] z-20 py-1">
            <button
              onClick={() => loadFavorite(favorites.join('+'))}
              className="block w-full text-left text-blue-400 hover:text-blue-300 hover:bg-white/5 px-3 py-1.5 text-xs font-medium transition-colors border-b border-white/10"
            >
              Browse All
            </button>
            {favorites.map((fav) => (
              <button
                key={fav}
                onClick={() => loadFavorite(fav)}
                className="block w-full text-left text-white/50 hover:text-white hover:bg-white/5 px-3 py-1.5 text-xs transition-colors"
              >
                r/{fav}
              </button>
            ))}
          </div>
        )}
        <SettingsPopover />
      </div>
    </div>
  );
}

function formatScore(score: number): string {
  if (score >= 1000) return (score / 1000).toFixed(1) + "k";
  return String(score);
}
