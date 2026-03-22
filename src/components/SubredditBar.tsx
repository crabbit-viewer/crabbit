import { useState, useContext, useEffect, FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AppStateContext, AppDispatchContext } from "../state/context";
import { useReddit } from "../hooks/useReddit";

export function SubredditBar() {
  const state = useContext(AppStateContext);
  const dispatch = useContext(AppDispatchContext);
  const { fetchPosts } = useReddit();
  const [input, setInput] = useState(state.subreddit);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [showFavs, setShowFavs] = useState(false);

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
    // Re-fetch will happen via effect in App
  };

  const handleTimeChange = (time: string) => {
    dispatch({ type: "SET_TIME_RANGE", payload: time });
    dispatch({ type: "SET_PLAYING", payload: false });
  };

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

      <select
        value={state.sort}
        onChange={(e) => handleSortChange(e.target.value)}
        className="bg-white/10 text-white text-sm rounded px-2 py-1 outline-none"
      >
        <option value="hot">Hot</option>
        <option value="new">New</option>
        <option value="top">Top</option>
        <option value="rising">Rising</option>
        <option value="controversial">Controversial</option>
      </select>

      {(state.sort === "top" || state.sort === "controversial") && (
        <select
          value={state.timeRange}
          onChange={(e) => handleTimeChange(e.target.value)}
          className="bg-white/10 text-white text-sm rounded px-2 py-1 outline-none"
        >
          <option value="hour">Hour</option>
          <option value="day">Day</option>
          <option value="week">Week</option>
          <option value="month">Month</option>
          <option value="year">Year</option>
          <option value="all">All Time</option>
        </select>
      )}

      {/* Favorites dropdown */}
      <div className="relative ml-auto">
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
      </div>
    </div>
  );
}
