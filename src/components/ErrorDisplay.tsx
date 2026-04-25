import { useContext } from "react";
import { AppDispatchContext } from "../state/context";

interface Props {
  message: string;
}

export function ErrorDisplay({ message }: Props) {
  const dispatch = useContext(AppDispatchContext);

  return (
    <div className="absolute inset-0 flex items-center justify-center z-30">
      <div className="text-center max-w-sm px-8 py-6 rounded-xl bg-[var(--surface-2)] border border-[var(--accent-danger)]/20 animate-fade-in">
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-8 h-8 text-[var(--accent-danger)]/50 mx-auto mb-3">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
        <p className="text-[var(--accent-danger)]/80 text-sm mb-4">{message}</p>
        <button
          onClick={() => dispatch({ type: "SET_ERROR", payload: null })}
          className="text-white/50 hover:text-white text-xs px-4 py-1.5 rounded-lg border border-white/10 hover:border-white/20 transition-colors"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
