import { createContext, Dispatch } from "react";
import { AppState, AppAction, initialState } from "./reducer";

export const AppStateContext = createContext<AppState>(initialState);
export const AppDispatchContext = createContext<Dispatch<AppAction>>(() => {});
