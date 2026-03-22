import { useCallback, useContext } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AppDispatchContext, AppStateContext } from "../state/context";
import { FetchResult } from "../types";

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
        const result = await invoke<FetchResult>("fetch_posts", {
          params: {
            subreddit: sub,
            sort: state.sort,
            time_range: state.timeRange,
            after: append ? state.after : null,
            limit: 50,
          },
        });

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
    [state.subreddit, state.sort, state.timeRange, state.after, dispatch]
  );

  return { fetchPosts };
}
