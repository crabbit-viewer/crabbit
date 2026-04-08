import { useState, useEffect, useContext } from "react";
import { invoke } from "../invoke";
import { AppDispatchContext } from "../state/context";
import { useReddit } from "../hooks/useReddit";

export function HomePage() {
  const dispatch = useContext(AppDispatchContext);
  const { fetchPosts } = useReddit();
  const [favorites, setFavorites] = useState<string[]>([]);

  useEffect(() => {
    invoke<string[]>("get_favorites").then(setFavorites).catch(() => {});
  }, []);

  const loadSubreddit = (sub: string) => {
    dispatch({ type: "SET_PLAYING", payload: false });
    fetchPosts(sub);
  };

  if (favorites.length === 0) {
    return (
      <div className="flex items-center justify-center w-full h-full text-white/30 text-base tracking-wide">
        No favorites yet — enter a subreddit above to start browsing
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center w-full h-full px-8 py-16">
      <button
        onClick={() => loadSubreddit(favorites.join("+"))}
        className="mb-8 px-6 py-2.5 rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 hover:text-blue-300 text-sm font-medium transition-colors border border-blue-500/20 hover:border-blue-500/30"
      >
        Browse All Favorites
      </button>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl w-full">
        {favorites.map((fav) => (
          <button
            key={fav}
            onClick={() => loadSubreddit(fav)}
            className="group w-full min-w-[160px] flex items-center px-5 py-5 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.06] hover:border-white/[0.15] transition-all duration-200 hover:shadow-lg hover:shadow-black/20 hover:scale-[1.02] border-l-2 border-l-blue-500/20 hover:border-l-blue-400/50"
          >
            <span className="truncate max-w-full text-sm transition-colors">
              <span className="text-white/25 group-hover:text-white/40">r/</span>
              <span className="text-white/50 group-hover:text-white">{fav}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
