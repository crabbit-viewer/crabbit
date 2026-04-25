import { useState, useContext, useEffect, useMemo, useCallback } from "react";
import { invoke } from "../invoke";
import { AppStateContext, AppDispatchContext } from "../state/context";

function CollapsibleSection({ title, count, defaultOpen, children }: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultOpen ?? false);

  return (
    <div className="border-b border-white/[0.04]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center w-full px-5 py-3 text-left hover:bg-white/[0.02] transition-colors"
      >
        <span className="text-white/25 text-[11px] uppercase tracking-widest font-semibold">
          {title}
        </span>
        {count !== undefined && count > 0 && (
          <span className="text-white/15 text-[11px] ml-2 bg-white/[0.06] rounded-full px-1.5 py-0.5 leading-none">
            {count}
          </span>
        )}
        <svg
          viewBox="0 0 16 16"
          fill="currentColor"
          className={`w-3 h-3 ml-auto text-white/20 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
        >
          <path d="M4.5 6l3.5 4 3.5-4z" />
        </svg>
      </button>
      {expanded && (
        <div className="px-5 pb-3">
          {children}
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const state = useContext(AppStateContext);
  const dispatch = useContext(AppDispatchContext);
  const [ignoredUsers, setIgnoredUsers] = useState<string[]>([]);
  const [savePath, setSavePath] = useState("");

  const open = state.sidebarOpen;
  const close = useCallback(() => dispatch({ type: "SET_SIDEBAR", payload: false }), [dispatch]);

  useEffect(() => {
    if (open) {
      invoke<string[]>("get_ignored_users").then(setIgnoredUsers).catch(() => {});
      invoke<string>("get_save_path").then(setSavePath).catch(() => {});
    }
  }, [open]);

  // Top posters analysis
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
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 sidebar-backdrop ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={close}
      />

      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 bottom-0 w-80 z-50 sidebar-panel flex flex-col overflow-hidden`}
        style={{
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 250ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 h-12 border-b border-white/[0.06] flex-shrink-0">
          <span className="text-white/70 text-sm font-semibold tracking-tight">Menu</span>
          <button onClick={close} className="icon-btn w-7 h-7">
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
              <path d="M4.646 4.646a.5.5 0 01.708 0L8 7.293l2.646-2.647a.5.5 0 01.708.708L8.707 8l2.647 2.646a.5.5 0 01-.708.708L8 8.707l-2.646 2.647a.5.5 0 01-.708-.708L7.293 8 4.646 5.354a.5.5 0 010-.708z" />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {/* Account */}
          <div className="px-5 py-4 border-b border-white/[0.04]">
            <div className="text-white/25 text-[11px] uppercase tracking-widest font-semibold mb-3">Account</div>
            <button
              onClick={handleLogin}
              className="flex items-center gap-2.5 w-full text-left text-xs text-white/60 hover:text-white hover:bg-white/[0.04] px-3 py-2 rounded-lg transition-colors"
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

          {/* Top Posters — collapsible, only when posts are loaded */}
          {state.posts.length > 0 && (
            <CollapsibleSection title="Top Posters" count={state.posts.length} defaultOpen>
              <div className="max-h-[280px] overflow-y-auto space-y-0.5">
                {authors.length === 0 ? (
                  <div className="text-white/20 text-xs px-3 py-2">No authors</div>
                ) : (
                  authors.slice(0, 20).map((entry) => (
                    <div
                      key={entry.name}
                      className="flex items-center gap-2.5 px-3 py-1.5 text-xs hover:bg-white/[0.04] rounded-lg transition-colors group"
                    >
                      <span className="text-white/25 font-mono text-[11px] w-5 text-right shrink-0 font-medium">
                        {entry.count}
                      </span>
                      <span className="text-white/50 truncate flex-1">
                        u/{entry.name}
                      </span>
                      <button
                        onClick={() => handleIgnore(entry.name)}
                        className="text-white/15 hover:text-[var(--accent-danger)] transition-colors shrink-0 opacity-0 group-hover:opacity-100"
                        title={`Ignore u/${entry.name}`}
                      >
                        <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                          <path d="M4.646 4.646a.5.5 0 01.708 0L8 7.293l2.646-2.647a.5.5 0 01.708.708L8.707 8l2.647 2.646a.5.5 0 01-.708.708L8 8.707l-2.646 2.647a.5.5 0 01-.708-.708L7.293 8 4.646 5.354a.5.5 0 010-.708z" />
                        </svg>
                      </button>
                    </div>
                  ))
                )}
              </div>
            </CollapsibleSection>
          )}

          {/* Ignored Users — collapsible, collapsed by default */}
          <CollapsibleSection title="Ignored Users" count={ignoredUsers.length}>
            {ignoredUsers.length === 0 ? (
              <div className="text-white/20 text-xs px-3 py-2">No ignored users</div>
            ) : (
              <div className="space-y-0.5 max-h-[200px] overflow-y-auto">
                {ignoredUsers.map((user) => (
                  <div
                    key={user}
                    className="flex items-center justify-between px-3 py-1.5 text-xs text-white/50 hover:bg-white/[0.04] rounded-lg transition-colors group"
                  >
                    <span>u/{user}</span>
                    <button
                      onClick={async () => {
                        await invoke("remove_ignored_user", { username: user });
                        setIgnoredUsers((prev) => prev.filter((u) => u !== user));
                      }}
                      className="text-white/15 hover:text-[var(--accent-danger)] transition-colors opacity-0 group-hover:opacity-100"
                      title="Unignore"
                    >
                      <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                        <path d="M4.646 4.646a.5.5 0 01.708 0L8 7.293l2.646-2.647a.5.5 0 01.708.708L8.707 8l2.647 2.646a.5.5 0 01-.708.708L8 8.707l-2.646 2.647a.5.5 0 01-.708-.708L7.293 8 4.646 5.354a.5.5 0 010-.708z" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CollapsibleSection>

          {/* Settings */}
          <div className="px-5 py-4">
            <div className="text-white/25 text-[11px] uppercase tracking-widest font-semibold mb-3">Settings</div>
            <div className="text-white/30 text-[10px] uppercase tracking-wider mb-1.5 px-3">Save location</div>
            <div className="text-white/50 text-xs break-all mb-3 leading-relaxed px-3">{savePath || "..."}</div>
            <div className="flex gap-2 px-3">
              <button
                onClick={pickFolder}
                className="text-white/50 hover:text-white text-xs px-3 py-1.5 rounded-lg border border-white/[0.08] hover:border-white/[0.15] transition-colors"
              >
                Change
              </button>
              <button
                onClick={() => invoke("open_save_folder").catch(() => {})}
                className="text-white/50 hover:text-white text-xs px-3 py-1.5 rounded-lg border border-white/[0.08] hover:border-white/[0.15] transition-colors"
              >
                Open
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
