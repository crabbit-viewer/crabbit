import { useState, useEffect, useContext } from "react";
import { invoke } from "../invoke";
import { AppDispatchContext } from "../state/context";
import { useReddit } from "../hooks/useReddit";

const CARD_COLORS = [
  "#60a5fa", // blue
  "#a78bfa", // violet
  "#f472b6", // pink
  "#fb923c", // orange
  "#34d399", // emerald
  "#fbbf24", // amber
  "#2dd4bf", // teal
  "#e879f9", // fuchsia
];

function hashColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return CARD_COLORS[Math.abs(hash) % CARD_COLORS.length];
}

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
      <div
        className="flex flex-col items-center justify-center w-full h-full gap-5"
        style={{
          background: "radial-gradient(ellipse at center, var(--surface-2) 0%, var(--surface-0) 70%)",
        }}
      >
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" className="text-white/[0.06]">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z" fill="currentColor"/>
        </svg>
        <div className="text-center">
          <p className="text-white/25 text-lg font-medium tracking-tight mb-2">crabbit</p>
          <p className="text-white/20 text-sm">Enter a subreddit above to start browsing</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col items-center justify-center w-full h-full px-8 py-16"
      style={{
        background: "radial-gradient(ellipse at center, var(--surface-2) 0%, var(--surface-0) 70%)",
      }}
    >
      <button
        onClick={() => loadSubreddit(favorites.join("+"))}
        className="mb-8 px-6 py-2.5 rounded-lg bg-[var(--accent)]/15 text-[var(--accent)] hover:bg-[var(--accent)]/25 text-sm font-medium transition-all border border-[var(--accent)]/15 hover:border-[var(--accent)]/30"
      >
        Browse All Favorites
      </button>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 max-w-3xl w-full">
        {favorites.map((fav) => {
          const color = hashColor(fav);
          return (
            <button
              key={fav}
              onClick={() => loadSubreddit(fav)}
              className="group w-full flex items-center gap-3 px-4 py-4 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.06] hover:border-white/[0.15] transition-all duration-200 hover:shadow-lg hover:shadow-black/20 hover:scale-[1.02]"
              style={{ borderLeftWidth: 3, borderLeftColor: color + "40" }}
            >
              <span
                className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 transition-opacity group-hover:opacity-100 opacity-60"
                style={{ backgroundColor: color + "18", color }}
              >
                {fav.charAt(0).toUpperCase()}
              </span>
              <span className="truncate max-w-full text-sm transition-colors">
                <span className="text-white/20 group-hover:text-white/40 text-xs">r/</span>
                <span className="text-white/50 group-hover:text-white">{fav}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
