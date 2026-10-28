import { contextBridge, ipcRenderer, webUtils } from "electron";

const channels = new Set(["command", "progress", "open-files", "save-failed"]);

contextBridge.exposeInMainWorld("shelf", {
  call: async (method: string, ...args: unknown[]) => {
    const res = await ipcRenderer.invoke("shelf", method, ...args);
    if (!res.ok) throw new Error(res.error);
    return res.value;
  },
  on: (channel: string, listener: (...args: unknown[]) => void) => {
    if (!channels.has(channel)) return () => {};
    const wrapped = (_: unknown, ...args: unknown[]) => listener(...args);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
  pathForFile: (file: File) => webUtils.getPathForFile(file),
  platform: process.platform,
});
