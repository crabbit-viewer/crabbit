import { useContext, RefObject } from "react";
import { AppStateContext } from "../state/context";
import { MediaDisplay } from "./MediaDisplay";
import { ControlBar } from "./ControlBar";
import { SubredditBar } from "./SubredditBar";
import { VideoTimeline } from "./VideoTimeline";
import { useSavedPosts } from "../hooks/useSavedPosts";
import { HomePage } from "./HomePage";
import { SavedGridView } from "./SavedGridView";
import { ZoomPanState } from "../hooks/useZoomPan";
import type { VideoPlayback } from "../hooks/useVideoPlayback";

interface Props {
  onNext: () => void;
  onPrev: () => void;
  onToggleAutoplayPlay: () => void;
  onToggleAutoplay: () => void;
  onRotate: () => void;
  rotation: number;
  uiVisible: boolean;
  zoomPan?: ZoomPanState;
  videoRef: RefObject<HTMLVideoElement | null>;
  audioRef: RefObject<HTMLAudioElement | null>;
  videoPlayback: VideoPlayback | null;
}

export function SlideshowView({ onNext, onPrev, onToggleAutoplayPlay, onToggleAutoplay, onRotate, rotation, uiVisible, zoomPan, videoRef, audioRef, videoPlayback }: Props) {
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
      <MediaDisplay post={currentPost} rotation={rotation} zoomPan={zoomPan} videoRef={videoRef} audioRef={audioRef} />
      <SubredditBar uiVisible={uiVisible} />
      {videoPlayback && (
        <VideoTimeline
          currentTime={videoPlayback.currentTime}
          duration={videoPlayback.duration}
          onSeek={videoPlayback.seek}
          visible={uiVisible}
        />
      )}
      <ControlBar
        onNext={onNext}
        onPrev={onPrev}
        onToggleAutoplayPlay={onToggleAutoplayPlay}
        onToggleAutoplay={onToggleAutoplay}
        onSave={saveCurrentPost}
        onDelete={state.viewMode === "saved" ? deleteCurrentPost : undefined}
        onRotate={onRotate}
        showRotate={isVideo}
        uiVisible={uiVisible}
        videoPlayback={videoPlayback}
      />
    </div>
  );
}
