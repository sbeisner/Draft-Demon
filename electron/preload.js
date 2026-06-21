// Exposes the backend URL and a small IPC bridge to the main window. The
// renderer talks to the backend over plain HTTP (CORS open on localhost during
// dev); IPC is only used for window control.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("DRAFTDEMON_API", "http://localhost:8741");
contextBridge.exposeInMainWorld("draftDemon", {
  openMain: () => ipcRenderer.send("open-main-window"),
  // spellcheck dictionary
  syncDictionary: (words) => ipcRenderer.send("sync-dictionary", words),
  onDictAdd: (cb) => ipcRenderer.on("dict-add", (e, word) => cb(word)),
});
