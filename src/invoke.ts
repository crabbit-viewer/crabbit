// Electron IPC bridge — drop-in replacement for Tauri's invoke()

declare global {
  interface Window {
    electronAPI: {
      invoke: <T>(channel: string, args?: Record<string, unknown>) => Promise<T>;
      onRedgifsResolved: (callback: (updates: any[]) => void) => () => void;
    };
  }
}

export async function invoke<T>(
  cmd: string,
  args?: Record<string, unknown>
): Promise<T> {
  return window.electronAPI.invoke<T>(cmd, args);
}
