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

      try {
        const params = {
          subreddit: sub,
          sort: state.sort,
          time_range: state.timeRange,
          after: append ? state.after : null,
          limit: 50,
        };

        // When logged in, fetch via main process (net.fetch includes session cookies).
        // When not logged in, fetch from renderer (bypasses Cloudflare bot detection).
        const [result, ignored] = await Promise.all([
          state.isLoggedIn
            ? invoke<FetchResult>("fetch_posts", { params })
            : fetchRedditPosts(params),
          invoke<string[]>("get_ignored_users").catch(() => [] as string[]),
        ]);

        if (ignored.length > 0) {
          const ignoredSet = new Set(ignored.map((u) => u.toLowerCase()));
          result.posts = result.posts.filter(
            (p) => !ignoredSet.has(p.author.toLowerCase())
          );
        }

        if (append) {
          dispatch({ type: "APPEND_POSTS", payload: result });
        } else {
          dispatch({ type: "SET_POSTS", payload: result });
          if (subreddit) {
            dispatch({ type: "SET_SUBREDDIT", payload: sub });
          }
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
