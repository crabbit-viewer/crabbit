import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  invoke: <T>(channel: string, args?: Record<string, unknown>): Promise<T> => {
    return ipcRenderer.invoke(channel, args);
  },
});
