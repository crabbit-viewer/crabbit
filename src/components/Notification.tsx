import { useContext, useEffect } from "react";
import { AppStateContext, AppDispatchContext } from "../state/context";

export function Notification() {
  const state = useContext(AppStateContext);
  const dispatch = useContext(AppDispatchContext);

  useEffect(() => {
    if (!state.notification) return;
    const timer = setTimeout(() => {
      dispatch({ type: "SET_NOTIFICATION", payload: null });
    }, 2000);
    return () => clearTimeout(timer);
  }, [state.notification, dispatch]);

  if (!state.notification) return null;

  const isError = state.notification.type === "error";

  return (
    <div
      className={`fixed top-12 left-1/2 -translate-x-1/2 ${
        isError ? "text-red-400" : "text-white/60"
      } text-xs px-3 py-1.5 bg-black/70 backdrop-blur-sm rounded-full border border-white/10 z-50 animate-fade-in`}
    >
      {state.notification.message}
    </div>
  );
}
