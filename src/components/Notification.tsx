import { useContext, useEffect } from "react";
import { AppStateContext, AppDispatchContext } from "../state/context";

export function Notification() {
  const state = useContext(AppStateContext);
  const dispatch = useContext(AppDispatchContext);

  useEffect(() => {
    if (!state.notification) return;
    const timer = setTimeout(() => {
      dispatch({ type: "SET_NOTIFICATION", payload: null });
    }, 3000);
    return () => clearTimeout(timer);
  }, [state.notification, dispatch]);

  if (!state.notification) return null;

  const bgColor =
    state.notification.type === "success" ? "bg-green-600" : "bg-red-600";

  return (
    <div
      className={`fixed top-16 right-4 ${bgColor} text-white text-sm px-4 py-2 rounded shadow-lg z-50 animate-fade-in`}
    >
      {state.notification.message}
    </div>
  );
}
