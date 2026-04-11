import { useContext, useEffect, useReducer, useState } from "react";
import { appReducer, initialState } from "./state/reducer";
import { AppStateContext, AppDispatchContext } from "./state/context";
import { invoke } from "./invoke";
import { SlideshowView } from "./components/SlideshowView";
import { LoadingSpinner } from "./components/LoadingSpinner";
import { ErrorDisplay } from "./components/ErrorDisplay";
import { Notification } from "./components/Notification";
import { useSlideshow } from "./hooks/useSlideshow";
import { useKeyboard } from "./hooks/useKeyboard";
import { useSavedPosts } from "./hooks/useSavedPosts";
import { useIdleHide } from "./hooks/useIdleHide";

function SlideshowContainer() {
  const state = useContext(AppStateContext);
  const { next, prev, togglePlay } = useSlideshow();
  const { saveCurrentPost } = useSavedPosts();
  const [rotation, setRotation] = useState(0);
  const rotateCCW = () => setRotation((r) => r - 90);

  // Reset rotation whenever the current slide changes.
  useEffect(() => {
    setRotation(0);
  }, [state.currentIndex]);

  useKeyboard(next, prev, togglePlay, saveCurrentPost, rotateCCW);
  const uiVisible = useIdleHide(2500);

  return (
    <SlideshowView
      onNext={next}
      onPrev={prev}
      onTogglePlay={togglePlay}
      onRotate={rotateCCW}
      rotation={rotation}
      uiVisible={uiVisible}
    />
  );
}

export default function App() {
  const [state, dispatch] = useReducer(appReducer, initialState);

  useEffect(() => {
    invoke<boolean>("reddit_check_login")
      .then((loggedIn) => dispatch({ type: "SET_LOGGED_IN", payload: loggedIn }))
      .catch(() => {});
  }, []);

  return (
    <AppStateContext.Provider value={state}>
      <AppDispatchContext.Provider value={dispatch}>
        <div className="w-screen h-screen bg-black overflow-hidden relative cursor-default">
          <SlideshowContainer />
          {state.isLoading && <LoadingSpinner />}
          {state.error && <ErrorDisplay message={state.error} />}
          <Notification />
        </div>
      </AppDispatchContext.Provider>
    </AppStateContext.Provider>
  );
}
