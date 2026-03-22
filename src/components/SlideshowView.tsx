import { useContext } from "react";
import { AppStateContext } from "../state/context";
import { MediaDisplay } from "./MediaDisplay";
import { PostOverlay } from "./PostOverlay";
import { ControlBar } from "./ControlBar";
import { useSavedPosts } from "../hooks/useSavedPosts";

interface Props {
  onNext: () => void;
  onPrev: () => void;
  onTogglePlay: () => void;
}

export function SlideshowView({ onNext, onPrev, onTogglePlay }: Props) {
  const state = useContext(AppStateContext);
  const { saveCurrentPost, deleteCurrentPost } = useSavedPosts();
  const currentPost = state.posts[state.currentIndex];

  if (!currentPost) {
    const message = state.viewMode === "saved"
      ? "No saved posts yet"
      : "Enter a subreddit to start browsing";
    return (
      <div className="flex items-center justify-center w-full h-full text-white/40 text-lg">
        {message}
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <MediaDisplay post={currentPost} />
      <PostOverlay post={currentPost} visible={state.showOverlay} />
      <ControlBar
        onNext={onNext}
        onPrev={onPrev}
        onTogglePlay={onTogglePlay}
        onSave={saveCurrentPost}
        onDelete={state.viewMode === "saved" ? deleteCurrentPost : undefined}
      />
    </div>
  );
}
