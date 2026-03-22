import { useReducer } from "react";
import { appReducer, initialState } from "./state/reducer";
import { AppStateContext, AppDispatchContext } from "./state/context";
import { SubredditBar } from "./components/SubredditBar";
import { SlideshowView } from "./components/SlideshowView";
import { LoadingSpinner } from "./components/LoadingSpinner";
import { ErrorDisplay } from "./components/ErrorDisplay";
import { useSlideshow } from "./hooks/useSlideshow";
import { useKeyboard } from "./hooks/useKeyboard";

function SlideshowContainer() {
  const { next, prev, togglePlay } = useSlideshow();
  useKeyboard(next, prev, togglePlay);

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
        </div>
      </AppDispatchContext.Provider>
    </AppStateContext.Provider>
  );
}
