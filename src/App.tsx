import { useCallback, useContext, useEffect, useReducer, useRef, useState } from "react";
import { appReducer, initialState } from "./state/reducer";
import { AppStateContext, AppDispatchContext } from "./state/context";
import { invoke } from "./invoke";
import { SlideshowView } from "./components/SlideshowView";
import { LoadingSpinner } from "./components/LoadingSpinner";
import { ErrorDisplay } from "./components/ErrorDisplay";
import { Notification } from "./components/Notification";
import { Sidebar } from "./components/Sidebar";
import { useSlideshow } from "./hooks/useSlideshow";
import { useKeyboard } from "./hooks/useKeyboard";
import { useVideoPlayback } from "./hooks/useVideoPlayback";
import { useSavedPosts } from "./hooks/useSavedPosts";
import { useIdleHide } from "./hooks/useIdleHide";
import { useZoomPan } from "./hooks/useZoomPan";
import type { MediaFilter, MediaType } from "./types";

function matchesFilter(mediaType: MediaType, filter: MediaFilter): boolean {
  if (filter === "all") return true;
  if (filter === "photos") return mediaType === "image" || mediaType === "gallery";
  return mediaType === "video" || mediaType === "animated_gif" || mediaType === "embed";
}

function SlideshowContainer() {
  const state = useContext(AppStateContext);
  const dispatch = useContext(AppDispatchContext);
  useSlideshow();
  const { saveCurrentPost } = useSavedPosts();
  const [rotation, setRotation] = useState(0);
  const [isPending, setIsPending] = useState(false);
  const pendingRef = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const rotateCCW = () => setRotation((r) => r - 90);

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const zoomPan = useZoomPan([state.currentIndex, state.galleryIndex]);

  // Reset rotation whenever the current slide changes.
  useEffect(() => {
    setRotation(0);
  }, [state.currentIndex]);

  const navigate = useCallback(async (direction: "next" | "prev") => {
    if (pendingRef.current) return;
    const { posts, currentIndex, mediaFilter } = stateRef.current;

    // Find target index
    let targetIdx: number | null = null;
    if (direction === "next") {
      for (let i = currentIndex + 1; i < posts.length; i++) {
        if (matchesFilter(posts[i].media_type, mediaFilter)) { targetIdx = i; break; }
      }
    } else {
      for (let i = currentIndex - 1; i >= 0; i--) {
        if (matchesFilter(posts[i].media_type, mediaFilter)) { targetIdx = i; break; }
      }
    }
    if (targetIdx === null) return;

    const target = posts[targetIdx];
    const isVideo = target.media_type === "video" || target.media_type === "animated_gif";

    if (isVideo && target.media[0]) {
      pendingRef.current = true;
      setIsPending(true);
      try {
        await invoke("preload_video", { url: target.media[0].url });
      } catch {}
      pendingRef.current = false;
      setIsPending(false);
    }

    dispatch({ type: "SET_INDEX", payload: targetIdx });
  }, [dispatch]);

  const next = useCallback(() => navigate("next"), [navigate]);
  const prev = useCallback(() => navigate("prev"), [navigate]);

  const currentPost = state.posts[state.currentIndex] ?? null;
  const videoPlayback = useVideoPlayback(videoRef, audioRef, currentPost?.id);

  const toggleAutoplay = useCallback(() => {
    dispatch({ type: "TOGGLE_AUTOPLAY" });
  }, [dispatch]);

  const toggleAutoplayPlay = useCallback(() => {
    dispatch({ type: "TOGGLE_PLAY" });
  }, [dispatch]);

  // Auto-advance timer (only runs in autoplay mode)
  const nextRef = useRef(next);
  nextRef.current = next;
  useEffect(() => {
    if (!state.autoplayMode || !state.isPlaying || state.posts.length === 0 || currentPost?.media_type === "embed") return;
    const id = window.setInterval(() => nextRef.current(), state.timerSpeed);
    return () => clearInterval(id);
  }, [state.autoplayMode, state.isPlaying, state.timerSpeed, state.posts.length, currentPost?.media_type]);

  useKeyboard(next, prev, videoPlayback, saveCurrentPost, rotateCCW, zoomPan.resetZoom);
  const uiVisible = useIdleHide(2500);

  return (
    <>
      <SlideshowView
        onNext={next}
        onPrev={prev}
        onToggleAutoplayPlay={toggleAutoplayPlay}
        onToggleAutoplay={toggleAutoplay}
        onRotate={rotateCCW}
        rotation={rotation}
        uiVisible={uiVisible}
        zoomPan={zoomPan}
        videoRef={videoRef}
        audioRef={audioRef}
        videoPlayback={videoPlayback}
      />
      {isPending && <LoadingSpinner />}
    </>
  );
}

export default function App() {
  const [state, dispatch] = useReducer(appReducer, initialState);

  useEffect(() => {
    invoke<boolean>("reddit_check_login")
      .then((loggedIn) => dispatch({ type: "SET_LOGGED_IN", payload: loggedIn }))
      .catch(() => {});
  }, []);

  useEffect(() => {
    return window.electronAPI.onRedgifsResolved((updates) => {
      console.log(`[App] Received ${updates.length} redgifs updates`);
      dispatch({ type: "UPDATE_POSTS", payload: updates });
    });
  }, []);

  return (
    <AppStateContext.Provider value={state}>
      <AppDispatchContext.Provider value={dispatch}>
        <div className="w-screen h-screen bg-[var(--surface-0)] overflow-hidden relative cursor-default">
          <SlideshowContainer />
          {state.isLoading && state.posts.length === 0 && <LoadingSpinner />}
          {state.error && <ErrorDisplay message={state.error} />}
          <Notification />
          <Sidebar />
        </div>
      </AppDispatchContext.Provider>
    </AppStateContext.Provider>
  );
}
