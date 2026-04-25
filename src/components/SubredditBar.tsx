import { useState, useContext, useEffect, useRef, useCallback, useMemo, FormEvent } from "react";
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
        className="text-white/50 hover:text-white text-xs px-1.5 py-0.5 rounded transition-colors"
      >
        {label}
        <svg className="inline ml-0.5 w-3 h-3 opacity-50" viewBox="0 0 16 16" fill="currentColor">
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

interface OverflowMenuProps {
  onLoadFavorite: (sub: string) => void;
}

function OverflowMenu({ onLoadFavorite }: OverflowMenuProps) {
  const state = useContext(AppStateContext);
  const dispatch = useContext(AppDispatchContext);
  const [open, setOpen] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [ignoredUsers, setIgnoredUsers] = useState<string[]>([]);
  const [savePath, setSavePath] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useClickOutside(ref, useCallback(() => setOpen(false), []));

  useEffect(() => {
    if (open) {
      invoke<string[]>("get_favorites").then(setFavorites).catch(() => {});
      invoke<string[]>("get_ignored_users").then(setIgnoredUsers).catch(() => {});
      invoke<string>("get_save_path").then(setSavePath).catch(() => {});
    }
  }, [open]);

  // Analyzer data
  const authors = useMemo(() => {
    const counts = new Map<string, number>();
    for (const post of state.posts) {
      if (post.author === "[deleted]") continue;
      counts.set(post.author, (counts.get(post.author) || 0) + 1);
    }
    const entries: { name: string; count: number }[] = [];
    for (const [name, count] of counts) entries.push({ name, count });
    entries.sort((a, b) => b.count - a.count);
    return entries;
  }, [state.posts]);

  const handleLogin = async () => {
    if (state.isLoggedIn) {
      await invoke("reddit_logout");
      dispatch({ type: "SET_LOGGED_IN", payload: false });
    } else {
      const ok = await invoke<boolean>("reddit_login");
      if (ok) dispatch({ type: "SET_LOGGED_IN", payload: true });
    }
  };

  const handleIgnore = async (username: string) => {
    await invoke("add_ignored_user", { username });
    dispatch({ type: "REMOVE_POSTS_BY_AUTHOR", payload: username });
    setIgnoredUsers((prev) => prev.filter((u) => u !== username));
  };

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

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="icon-btn"
        title="Menu"
      >
        <svg viewBox="0 0 20 20" fill="currentColor">
          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 dropdown-panel min-w-[240px] max-h-[70vh] overflow-y-auto z-30">
          {/* Account */}
          <div className="px-3 py-2 border-b border-white/[0.06]">
            <div className="text-white/30 text-[10px] uppercase tracking-wider mb-2">Account</div>
            <button
              onClick={handleLogin}
              className="flex items-center gap-2 w-full text-left text-xs text-white/60 hover:text-white hover:bg-white/5 px-2 py-1.5 rounded transition-colors"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0">
                <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
              </svg>
              <span>{state.isLoggedIn ? "Log out" : "Log in to Reddit"}</span>
              {state.isLoggedIn && (
                <span className="ml-auto w-2 h-2 bg-[var(--accent-success)] rounded-full shrink-0" />
              )}
            </button>
          </div>

          {/* Favorites */}
          <div className="px-3 py-2 border-b border-white/[0.06]">
            <div className="text-white/30 text-[10px] uppercase tracking-wider mb-2">Favorites</div>
            {favorites.length === 0 ? (
              <div className="text-white/20 text-xs px-2 py-1">No favorites yet</div>
            ) : (
              <>
                <button
                  onClick={() => { onLoadFavorite(favorites.join("+")); setOpen(false); }}
                  className="block w-full text-left text-[var(--accent)] hover:bg-white/5 px-2 py-1.5 text-xs font-medium rounded transition-colors mb-0.5"
                >
                  Browse All
                </button>
                {favorites.map((fav) => (
                  <button
                    key={fav}
                    onClick={() => { onLoadFavorite(fav); setOpen(false); }}
                    className="block w-full text-left text-white/50 hover:text-white hover:bg-white/5 px-2 py-1.5 text-xs rounded transition-colors"
                  >
                    r/{fav}
                  </button>
                ))}
              </>
            )}
          </div>

          {/* Ignored Users */}
          <div className="px-3 py-2 border-b border-white/[0.06]">
            <div className="text-white/30 text-[10px] uppercase tracking-wider mb-2">Ignored Users</div>
            {ignoredUsers.length === 0 ? (
              <div className="text-white/20 text-xs px-2 py-1">No ignored users</div>
            ) : (
              ignoredUsers.map((user) => (
                <div
                  key={user}
                  className="flex items-center justify-between px-2 py-1.5 text-xs text-white/50 hover:bg-white/5 rounded transition-colors"
                >
                  <span>u/{user}</span>
                  <button
                    onClick={async () => {
                      await invoke("remove_ignored_user", { username: user });
                      setIgnoredUsers((prev) => prev.filter((u) => u !== user));
                    }}
                    className="text-white/30 hover:text-[var(--accent-danger)] transition-colors"
                    title="Unignore"
                  >
                    <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                      <path d="M4.646 4.646a.5.5 0 01.708 0L8 7.293l2.646-2.647a.5.5 0 01.708.708L8.707 8l2.647 2.646a.5.5 0 01-.708.708L8 8.707l-2.646 2.647a.5.5 0 01-.708-.708L7.293 8 4.646 5.354a.5.5 0 010-.708z"/>
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Top Posters (Analyzer) — only when posts are loaded */}
          {state.posts.length > 0 && (
            <div className="px-3 py-2 border-b border-white/[0.06]">
              <div className="text-white/30 text-[10px] uppercase tracking-wider mb-2">
                Top Posters ({state.posts.length} posts)
              </div>
              <div className="max-h-[200px] overflow-y-auto">
                {authors.length === 0 ? (
                  <div className="text-white/20 text-xs px-2 py-1">No authors</div>
                ) : (
                  authors.slice(0, 20).map((entry) => (
                    <div
                      key={entry.name}
                      className="flex items-center justify-between px-2 py-1.5 text-xs hover:bg-white/5 rounded transition-colors gap-2"
                    >
                      <span className="text-white/30 font-mono w-5 text-right shrink-0">
                        {entry.count}
                      </span>
                      <span className="text-white/50 truncate flex-1">
                        u/{entry.name}
                      </span>
                      <button
                        onClick={() => handleIgnore(entry.name)}
                        className="text-white/30 hover:text-[var(--accent-danger)] transition-colors shrink-0"
                        title={`Ignore u/${entry.name}`}
                      >
                        <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                          <path d="M4.646 4.646a.5.5 0 01.708 0L8 7.293l2.646-2.647a.5.5 0 01.708.708L8.707 8l2.647 2.646a.5.5 0 01-.708.708L8 8.707l-2.646 2.647a.5.5 0 01-.708-.708L7.293 8 4.646 5.354a.5.5 0 010-.708z" />
                        </svg>
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Settings */}
          <div className="px-3 py-2">
            <div className="text-white/30 text-[10px] uppercase tracking-wider mb-2">Settings</div>
            <div className="text-white/40 text-[10px] uppercase tracking-wider mb-1">Save location</div>
            <div className="text-white/60 text-xs break-all mb-2 leading-relaxed px-2">{savePath || "..."}</div>
            <div className="flex gap-2 px-2">
              <button
                onClick={pickFolder}
                className="text-white/50 hover:text-white text-xs px-2.5 py-1 rounded border border-white/10 hover:border-white/20 transition-colors"
              >
                Change
              </button>
              <button
                onClick={() => invoke("open_save_folder").catch(() => {})}
                className="text-white/50 hover:text-white text-xs px-2.5 py-1 rounded border border-white/10 hover:border-white/20 transition-colors"
              >
                Open
              </button>
            </div>
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

  const loadFavorite = (sub: string) => {
    setInput(sub);
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
      <div className={`absolute top-0 left-0 right-0 h-10 flex items-center px-4 gap-3 z-10 ${chromeClass}`} style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)" }} data-ui-chrome>
        <span className="text-white/30 font-medium text-sm tracking-tight">crabbit</span>
        <div className="w-px h-4 bg-white/10" />
        <span className="text-[var(--accent)] text-xs">Saved</span>
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
        <OverflowMenu onLoadFavorite={loadFavorite} />
      </div>
    );
  }

  return (
    <div className={`absolute top-0 left-0 right-0 h-10 flex items-center px-4 gap-2 z-10 ${chromeClass}`} style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)" }} data-ui-chrome>
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
          className="bg-transparent text-white/80 text-xs w-36 outline-none border-b border-white/10 focus:border-[var(--accent-hover)]/50 px-1 py-0.5 transition-colors placeholder:text-white/20"
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
          onClick={loadSavedPosts}
          className="icon-btn"
          title="Saved posts"
        >
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" />
          </svg>
        </button>

        <OverflowMenu onLoadFavorite={loadFavorite} />
      </div>
    </div>
  );
}

function formatScore(score: number): string {
  if (score >= 1000) return (score / 1000).toFixed(1) + "k";
  return String(score);
}
