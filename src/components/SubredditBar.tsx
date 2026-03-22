import { useState, useContext, useEffect, useRef, FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AppStateContext, AppDispatchContext } from "../state/context";
import { useReddit } from "../hooks/useReddit";
import { useSavedPosts } from "../hooks/useSavedPosts";

function Dropdown({ value, options, onChange }: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const label = options.find((o) => o.value === value)?.label ?? value;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="bg-white/10 text-white text-sm rounded px-2 py-1 outline-none hover:bg-white/20"
      >
        {label} ▾
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 bg-gray-900 border border-gray-700 rounded shadow-lg min-w-[120px] z-20">
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`block w-full text-left px-3 py-1.5 text-sm ${
                opt.value === value ? "text-white bg-white/10" : "text-white/80 hover:bg-white/10"
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
    invoke<string>("get_save_path").then(setSavePath).catch(() => {});
  }, [open]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const pickFolder = async () => {
    try {
      // Use tauri dialog plugin
      const { open: openDialog } = await import("@tauri-apps/plugin-dialog");
      const selected = await openDialog({ directory: true, title: "Choose save folder" });
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
        className="text-white/60 hover:text-white text-sm px-1"
        title="Settings"
      >
        ⚙
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-gray-900 border border-gray-700 rounded shadow-lg p-3 z-20 min-w-[280px]">
          <div className="text-white/60 text-xs mb-1">Save location</div>
          <div className="text-white text-xs break-all mb-2">{savePath || "..."}</div>
          <div className="flex gap-2">
            <button
              onClick={pickFolder}
              className="bg-white/10 hover:bg-white/20 text-white text-xs px-2 py-1 rounded"
            >
              Change
            </button>
            <button
              onClick={openFolder}
              className="bg-white/10 hover:bg-white/20 text-white text-xs px-2 py-1 rounded"
            >
              Open Folder
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function SubredditBar() {
  const state = useContext(AppStateContext);
  const dispatch = useContext(AppDispatchContext);
  const { fetchPosts } = useReddit();
  const { loadSavedPosts, exitSavedView } = useSavedPosts();
  const [input, setInput] = useState(state.subreddit);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [showFavs, setShowFavs] = useState(false);

  const isSavedMode = state.viewMode === "saved";

  useEffect(() => {
    invoke<string[]>("get_favorites").then(setFavorites).catch(() => {});
  }, []);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const sub = input.trim();
    if (sub) {
      dispatch({ type: "SET_PLAYING", payload: false });
      fetchPosts(sub);
    }
  };

  const loadFavorite = (sub: string) => {
    setInput(sub);
    setShowFavs(false);
    dispatch({ type: "SET_PLAYING", payload: false });
    fetchPosts(sub);
  };

  const handleSortChange = (sort: string) => {
    dispatch({ type: "SET_SORT", payload: sort });
    dispatch({ type: "SET_PLAYING", payload: false });
  };

  const handleTimeChange = (time: string) => {
    dispatch({ type: "SET_TIME_RANGE", payload: time });
    dispatch({ type: "SET_PLAYING", payload: false });
  };

  // Re-fetch posts when sort or time range changes
  useEffect(() => {
    if (state.subreddit && state.posts.length > 0 && !isSavedMode) {
      fetchPosts();
    }
  }, [state.sort, state.timeRange]);

  if (isSavedMode) {
    return (
      <div className="absolute top-0 left-0 right-0 h-12 bg-black/70 flex items-center px-4 gap-3 z-10">
        <span className="text-orange-500 font-bold text-lg">crabbit</span>
        <span className="text-green-400 text-sm font-medium">Saved Posts</span>
        <button
          onClick={exitSavedView}
          className="bg-white/10 hover:bg-white/20 text-white text-sm rounded px-3 py-1 ml-auto"
        >
          Back to Browse
        </button>
        <SettingsPopover />
      </div>
    );
  }

  return (
    <div className="absolute top-0 left-0 right-0 h-12 bg-black/70 flex items-center px-4 gap-3 z-10">
      <span className="text-orange-500 font-bold text-lg">crabbit</span>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <span className="text-white/60">r/</span>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="subreddit"
          className="bg-white/10 text-white px-2 py-1 rounded text-sm w-48 outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          type="submit"
          className="text-white/60 hover:text-white text-sm px-2"
        >
          Go
        </button>
      </form>

      <Dropdown
        value={state.sort}
        options={[
          { value: "hot", label: "Hot" },
          { value: "new", label: "New" },
          { value: "top", label: "Top" },
          { value: "rising", label: "Rising" },
          { value: "controversial", label: "Controversial" },
        ]}
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

      {/* Saved + Favorites + Settings */}
      <div className="relative ml-auto flex items-center gap-2">
        <button
          onClick={loadSavedPosts}
          className="text-green-400/70 hover:text-green-400 text-sm px-2"
        >
          💾 Saved
        </button>
        <button
          onClick={() => {
            setShowFavs(!showFavs);
            invoke<string[]>("get_favorites")
              .then(setFavorites)
              .catch(() => {});
          }}
          className="text-white/60 hover:text-white text-sm px-2"
        >
          ★ Favorites
        </button>
        {showFavs && favorites.length > 0 && (
          <div className="absolute right-0 top-full mt-1 bg-gray-900 border border-gray-700 rounded shadow-lg min-w-[160px] z-20">
            {favorites.map((fav) => (
              <button
                key={fav}
                onClick={() => loadFavorite(fav)}
                className="block w-full text-left text-white/80 hover:bg-white/10 px-3 py-1.5 text-sm"
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
