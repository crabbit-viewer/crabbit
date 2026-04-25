import { useCallback, useContext } from "react";
import { invoke } from "../invoke";
import { fetchPosts as fetchRedditPosts } from "../reddit/client";
import { AppDispatchContext, AppStateContext } from "../state/context";
import type { FetchResult } from "../types";

export function useReddit() {
  const state = useContext(AppStateContext);
  const dispatch = useContext(AppDispatchContext);

  const fetchPosts = useCallback(
    async (subreddit?: string, append = false) => {
      const sub = subreddit || state.subreddit;
      if (!sub) return;

      dispatch({ type: "SET_LOADING", payload: true });
      dispatch({ type: "SET_ERROR", payload: null });
      const t0 = performance.now();

      try {
        const params = {
          subreddit: sub,
          sort: state.sort,
          time_range: state.timeRange,
          after: append ? state.after : null,
          limit: 50,
        };

        let result: FetchResult;
        let deferredUpdates: Promise<any[]> | null = null;

        if (state.isLoggedIn) {
          // Logged in: fetch via main process (redgifs resolved there, updates via IPC event)
          const [r, ignored] = await Promise.all([
            invoke<FetchResult>("fetch_posts", { params }),
            invoke<string[]>("get_ignored_users").catch(() => [] as string[]),
          ]);
          result = r;
          if (ignored.length > 0) {
            const ignoredSet = new Set(ignored.map((u) => u.toLowerCase()));
            result.posts = result.posts.filter(
              (p) => !ignoredSet.has(p.author.toLowerCase())
            );
          }
        } else {
          // Not logged in: fetch from renderer
          const [r, ignored] = await Promise.all([
            fetchRedditPosts(params),
            invoke<string[]>("get_ignored_users").catch(() => [] as string[]),
          ]);
          result = r.result;
          deferredUpdates = r.deferredUpdates;
          if (ignored.length > 0) {
            const ignoredSet = new Set(ignored.map((u) => u.toLowerCase()));
            result.posts = result.posts.filter(
              (p) => !ignoredSet.has(p.author.toLowerCase())
            );
          }
        }

        console.log(`[useReddit] fetch_posts completed in ${(performance.now() - t0).toFixed(0)}ms, got ${result.posts.length} posts`);

        if (append) {
          dispatch({ type: "APPEND_POSTS", payload: result });
        } else {
          // Start preloading the first video before React re-renders
          const first = result.posts[0];
          if (first && (first.media_type === "video" || first.media_type === "animated_gif") && first.media[0]) {
            invoke("preload_video", { url: first.media[0].url }).catch(() => {});
          }
          dispatch({ type: "SET_POSTS", payload: result });
          if (subreddit) {
            dispatch({ type: "SET_SUBREDDIT", payload: sub });
          }
        }

        // Handle deferred redgifs updates (renderer-side fetch only)
        if (deferredUpdates) {
          deferredUpdates.then((updates) => {
            if (updates.length > 0) {
              dispatch({ type: "UPDATE_POSTS", payload: updates });
            }
          }).catch(() => {});
        }
      } catch (err) {
        dispatch({
          type: "SET_ERROR",
          payload: err instanceof Error ? err.message : String(err),
        });
      } finally {
        dispatch({ type: "SET_LOADING", payload: false });
      }
    },
    [state.subreddit, state.sort, state.timeRange, state.after, state.isLoggedIn, dispatch]
  );

  return { fetchPosts };
}
