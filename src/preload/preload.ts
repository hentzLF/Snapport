import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("snapport", {
  closeOverlay: () => ipcRenderer.send("overlay:close"),
  sendReport: (payload: {
    webhookUrl: string;
    comment: string;
    imageDataUrl: string;
  }) => ipcRenderer.invoke("report:send", payload),
  onScreenshot: (callback: (dataUrl: string | null) => void) => {
    ipcRenderer.on("screenshot:ready", (_event, dataUrl) => callback(dataUrl));
  },
  onUpdateAvailable: (callback: () => void) => {
    ipcRenderer.on("update:available", callback);
  },
  onUpdateDownloaded: (callback: () => void) => {
    ipcRenderer.on("update:downloaded", callback);
  },
  installUpdate: () => ipcRenderer.send("update:install"),
});
