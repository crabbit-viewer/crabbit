import { useContext } from "react";
import { AppStateContext } from "../state/context";
import { MediaDisplay } from "./MediaDisplay";
import { ControlBar } from "./ControlBar";
import { SubredditBar } from "./SubredditBar";
import { useSavedPosts } from "../hooks/useSavedPosts";
import { HomePage } from "./HomePage";
import { SavedGridView } from "./SavedGridView";

interface Props {
  onNext: () => void;
  onPrev: () => void;
  onTogglePlay: () => void;
  onRotate: () => void;
  rotation: number;
  uiVisible: boolean;
}

export function SlideshowView({ onNext, onPrev, onTogglePlay, onRotate, rotation, uiVisible }: Props) {
  const state = useContext(AppStateContext);
  const { saveCurrentPost, deleteCurrentPost } = useSavedPosts();
  const currentPost = state.posts[state.currentIndex];

  const isVideo =
    currentPost?.media_type === "video" ||
    currentPost?.media_type === "animated_gif";

  if (state.viewMode === "saved" && state.savedDisplayMode === "grid") {
    return (
      <>
        <SubredditBar uiVisible={true} />
        <SavedGridView />
      </>
    );
  }

  if (!currentPost) {
    if (state.viewMode === "saved") {
      return (
        <>
          <SubredditBar uiVisible={true} />
          <div className="flex items-center justify-center w-full h-full text-white/30 text-base tracking-wide">
            No saved posts yet
          </div>
        </>
      );
    }
    return (
      <>
        <SubredditBar uiVisible={true} />
        <HomePage />
      </>
    );
  }

  return (
    <div className="relative w-full h-full">
      <MediaDisplay post={currentPost} rotation={rotation} />
      <SubredditBar uiVisible={uiVisible} />
      <ControlBar
        onNext={onNext}
        onPrev={onPrev}
        onTogglePlay={onTogglePlay}
        onSave={saveCurrentPost}
        onDelete={state.viewMode === "saved" ? deleteCurrentPost : undefined}
        onRotate={onRotate}
        showRotate={isVideo}
        uiVisible={uiVisible}
      />
    </div>
  );
}
