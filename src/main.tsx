import React from "react";
import ReactDOM from "react-dom/client";
import { invoke } from "./invoke";
import App from "./App";
import "./index.css";

// Pipe frontend console output to backend stderr
const origLog = console.log;
const origWarn = console.warn;
const origError = console.error;

function pipeToBackend(level: string, args: unknown[]) {
  const msg = args.map(a => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
  invoke("log_frontend", { level, msg }).catch(() => {});
}

console.log = (...args: unknown[]) => { origLog(...args); pipeToBackend("LOG", args); };
console.warn = (...args: unknown[]) => { origWarn(...args); pipeToBackend("WARN", args); };
console.error = (...args: unknown[]) => { origError(...args); pipeToBackend("ERROR", args); };

// Catch unhandled promise rejections
window.addEventListener("unhandledrejection", (e) => {
  pipeToBackend("UNHANDLED", [String(e.reason)]);
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
