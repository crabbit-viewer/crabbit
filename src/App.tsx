import { useReducer } from "react";
import { appReducer, initialState } from "./state/reducer";
import { AppStateContext, AppDispatchContext } from "./state/context";
import { SubredditBar } from "./components/SubredditBar";
import { SlideshowView } from "./components/SlideshowView";
import { LoadingSpinner } from "./components/LoadingSpinner";
import { ErrorDisplay } from "./components/ErrorDisplay";
import { Notification } from "./components/Notification";
import { useSlideshow } from "./hooks/useSlideshow";
import { useKeyboard } from "./hooks/useKeyboard";
import { useSavedPosts } from "./hooks/useSavedPosts";

function SlideshowContainer() {
  const { next, prev, togglePlay } = useSlideshow();
  const { saveCurrentPost } = useSavedPosts();
  useKeyboard(next, prev, togglePlay, saveCurrentPost);

  return (
    <SlideshowView
      onNext={next}
      onPrev={prev}
      onTogglePlay={togglePlay}
    />
  );
}

export default function App() {
  const [state, dispatch] = useReducer(appReducer, initialState);

  return (
    <AppStateContext.Provider value={state}>
      <AppDispatchContext.Provider value={dispatch}>
        <div className="w-screen h-screen bg-black overflow-hidden relative">
          <SubredditBar />
          <div className="absolute inset-0 pt-12">
            <SlideshowContainer />
          </div>
          {state.isLoading && <LoadingSpinner />}
          {state.error && <ErrorDisplay message={state.error} />}
          <Notification />
        </div>
      </AppDispatchContext.Provider>
    </AppStateContext.Provider>
  );
}
