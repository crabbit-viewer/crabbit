import { useCallback, useContext } from "react";
import { invoke } from "../invoke";
import { AppDispatchContext, AppStateContext } from "../state/context";
import { MediaPost, SavedPostMeta } from "../types";

function metaToMediaPost(meta: SavedPostMeta): MediaPost {
  const sub = meta.subreddit.toLowerCase();

  const media = meta.files.map((file) => ({
    url: `saved-media://localhost/${sub}/${encodeURIComponent(file)}`,
    width: null,
    height: null,
    caption: null,
  }));

  const audio_url = meta.audio_file
    ? `saved-media://localhost/${sub}/${encodeURIComponent(meta.audio_file)}`
    : null;

  return {
    id: meta.id,
    title: meta.title,
    author: meta.author,
    score: meta.score,
    num_comments: meta.num_comments,
    permalink: meta.permalink,
    subreddit: meta.subreddit,
    over_18: false,
    media_type: meta.media_type,
    media,
    audio_url,
    embed_url: null,
  };
}

export function useSavedPosts() {
  const dispatch = useContext(AppDispatchContext);
  const state = useContext(AppStateContext);

  const loadSavedPosts = useCallback(async () => {
    try {
      dispatch({ type: "SET_LOADING", payload: true });
      const metas = await invoke<SavedPostMeta[]>("get_saved_posts");
      const posts = metas.map(metaToMediaPost);
      dispatch({ type: "ENTER_SAVED_VIEW", payload: { posts } });
    } catch (e) {
      dispatch({
        type: "SET_NOTIFICATION",
        payload: { message: `Failed to load saved posts: ${e}`, type: "error" },
      });
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  }, [dispatch]);

  const saveCurrentPost = useCallback(async () => {
    const post = state.posts[state.currentIndex];
    if (!post) return;

    if (post.media_type === "embed") {
      dispatch({
        type: "SET_NOTIFICATION",
        payload: { message: "Embed posts cannot be saved", type: "error" },
      });
      return;
    }

    try {
      await invoke("save_post", { post });
      dispatch({ type: "SET_CURRENT_POST_SAVED", payload: true });
      dispatch({
        type: "SET_NOTIFICATION",
        payload: { message: "Post saved!", type: "success" },
      });
    } catch (e) {
      dispatch({
        type: "SET_NOTIFICATION",
        payload: { message: `Save failed: ${e}`, type: "error" },
      });
    }
  }, [state.posts, state.currentIndex, dispatch]);

  const deleteCurrentPost = useCallback(async () => {
    const post = state.posts[state.currentIndex];
    if (!post) return;

    try {
      await invoke("delete_saved_post", {
        subreddit: post.subreddit,
        postId: post.id,
      });
      dispatch({ type: "SET_CURRENT_POST_SAVED", payload: false });
      // Reload saved posts to refresh the list
      const metas = await invoke<SavedPostMeta[]>("get_saved_posts");
      const posts = metas.map(metaToMediaPost);
      const newIndex = Math.min(state.currentIndex, Math.max(0, posts.length - 1));
      dispatch({ type: "SET_POSTS", payload: { posts, after: null } });
      dispatch({ type: "SET_INDEX", payload: newIndex });
      dispatch({ type: "SET_VIEW_MODE", payload: "saved" });
      dispatch({
        type: "SET_NOTIFICATION",
        payload: { message: "Post deleted", type: "success" },
      });
    } catch (e) {
      dispatch({
        type: "SET_NOTIFICATION",
        payload: { message: `Delete failed: ${e}`, type: "error" },
      });
    }
  }, [state.posts, state.currentIndex, dispatch]);

  const checkIfSaved = useCallback(
    async (postId: string) => {
      try {
        const saved = await invoke<boolean>("is_post_saved", { postId });
        dispatch({ type: "SET_CURRENT_POST_SAVED", payload: saved });
      } catch {
        dispatch({ type: "SET_CURRENT_POST_SAVED", payload: false });
      }
    },
    [dispatch]
  );

  const exitSavedView = useCallback(() => {
    dispatch({ type: "EXIT_SAVED_VIEW" });
  }, [dispatch]);

  return { loadSavedPosts, saveCurrentPost, deleteCurrentPost, checkIfSaved, exitSavedView };
}
