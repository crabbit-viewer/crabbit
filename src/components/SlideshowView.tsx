import { useContext } from "react";
import { AppStateContext } from "../state/context";
import { MediaDisplay } from "./MediaDisplay";
import { PostOverlay } from "./PostOverlay";
import { ControlBar } from "./ControlBar";

interface Props {
  onNext: () => void;
  onPrev: () => void;
  onTogglePlay: () => void;
}

export function SlideshowView({ onNext, onPrev, onTogglePlay }: Props) {
  const state = useContext(AppStateContext);
  const currentPost = state.posts[state.currentIndex];

  if (!currentPost) {
    return (
      <div className="flex items-center justify-center w-full h-full text-white/40 text-lg">
        Enter a subreddit to start browsing
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
      />
    </div>
  );
}
