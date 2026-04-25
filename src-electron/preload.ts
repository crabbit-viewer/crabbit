import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  invoke: <T>(channel: string, args?: Record<string, unknown>): Promise<T> => {
    return ipcRenderer.invoke(channel, args);
  },
  onRedgifsResolved: (callback: (updates: any[]) => void) => {
    const handler = (_event: any, updates: any[]) => callback(updates);
    ipcRenderer.on("redgifs-resolved", handler);
    return () => ipcRenderer.removeListener("redgifs-resolved", handler);
  },
});
