const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopAPI", {
  savePdf: (bytes, filename) =>
    ipcRenderer.invoke("dialog:save-pdf", bytes, filename),
  getPrinters: () => ipcRenderer.invoke("printer:list"),
  printPhotoSheet: (options) =>
    ipcRenderer.invoke("photo:print-sheet", options),
  exportPhotoSheetPdf: (options) =>
    ipcRenderer.invoke("photo:export-pdf", options),
  scanDocument: () => ipcRenderer.invoke("scanner:scan-document"),
  isMaximized: () => ipcRenderer.invoke("window:is-maximized"),
  minimize: () => ipcRenderer.invoke("window:minimize"),
  toggleMaximize: () => ipcRenderer.invoke("window:toggle-maximize"),
  close: () => ipcRenderer.invoke("window:close"),
  checkUpdates: () => ipcRenderer.invoke("app:check-updates"),
  downloadUpdate: (tag) => ipcRenderer.invoke("app:download-update", tag),
  openInstallerDownload: (url) =>
    ipcRenderer.invoke("app:open-installer-download", url),
  openRepository: () => ipcRenderer.invoke("app:open-repository"),
  onUpdateProgress: (callback) => {
    const listener = (_event, percent) => callback(percent);
    ipcRenderer.on("app:update-progress", listener);
    return () => ipcRenderer.removeListener("app:update-progress", listener);
  },
  onUpdateInstalling: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("app:update-installing", listener);
    return () => ipcRenderer.removeListener("app:update-installing", listener);
  },
  onUpdateError: (callback) => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on("app:update-error", listener);
    return () => ipcRenderer.removeListener("app:update-error", listener);
  },
  onMaximizeChange: (callback) => {
    const listener = (_event, isMaximized) => callback(isMaximized);
    ipcRenderer.on("window:maximize-state", listener);
    return () => ipcRenderer.removeListener("window:maximize-state", listener);
  },
});
