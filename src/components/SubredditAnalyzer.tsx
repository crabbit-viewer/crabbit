import { useState, useRef, useContext, useCallback, useMemo } from "react";
import { invoke } from "../invoke";
import { AppStateContext, AppDispatchContext } from "../state/context";
import { useClickOutside } from "../hooks/useClickOutside";

interface AuthorEntry {
  name: string;
  count: number;
}

export function SubredditAnalyzer({ onOpen }: { onOpen?: () => void }) {
  const state = useContext(AppStateContext);
  const dispatch = useContext(AppDispatchContext);
  const [open, setOpen] = useState(false);
  const [ignored, setIgnored] = useState<Set<string>>(new Set());
  const ref = useRef<HTMLDivElement>(null);

  useClickOutside(ref, useCallback(() => setOpen(false), []));

  const authors = useMemo(() => {
    const counts = new Map<string, number>();
    for (const post of state.posts) {
      const author = post.author;
      if (author === "[deleted]") continue;
      counts.set(author, (counts.get(author) || 0) + 1);
    }
    const entries: AuthorEntry[] = [];
    for (const [name, count] of counts) {
      entries.push({ name, count });
    }
    entries.sort((a, b) => b.count - a.count);
    return entries;
  }, [state.posts]);

  const handleIgnore = async (username: string) => {
    await invoke("add_ignored_user", { username });
    dispatch({ type: "REMOVE_POSTS_BY_AUTHOR", payload: username });
    setIgnored((prev) => new Set(prev).add(username.toLowerCase()));
  };

  const toggle = () => {
    if (!open) {
      onOpen?.();
      setIgnored(new Set());
    }
    setOpen(!open);
  };

  const visibleAuthors = authors.filter(
    (a) => !ignored.has(a.name.toLowerCase())
  );

  if (state.posts.length === 0) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggle}
        className="icon-btn"
        title="Analyze posters"
      >
        <svg viewBox="0 0 20 20" fill="currentColor">
          <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zm6-4a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zm6-3a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 dropdown-panel min-w-[220px] z-20">
          <div className="px-3 py-2 border-b border-white/10">
            <span className="text-white/40 text-[10px] uppercase tracking-wider">
              Top Posters ({state.posts.length} posts)
            </span>
          </div>
          <div className="max-h-[300px] overflow-y-auto py-1">
            {visibleAuthors.length === 0 ? (
              <div className="px-3 py-1.5 text-xs text-white/30">No authors</div>
            ) : (
              visibleAuthors.map((entry) => (
                <div
                  key={entry.name}
                  className="flex items-center justify-between px-3 py-1.5 text-xs hover:bg-white/5 transition-colors gap-2"
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
    </div>
  );
}
