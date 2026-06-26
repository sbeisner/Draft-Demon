// Exposes the backend URL and a small IPC bridge to the main window. The
// renderer talks to the backend over plain HTTP (CORS scoped to localhost);
// IPC is used for window control and encrypted token storage.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("DRAFTDEMON_API", "http://localhost:8741");

// Supabase identity config, injected from the Electron process environment so
// it isn't hard-coded in the renderer bundle. (The anon key is public-safe.)
if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
  contextBridge.exposeInMainWorld("DRAFTDEMON_SUPABASE", {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
  });
}

contextBridge.exposeInMainWorld("draftDemon", {
  openMain: () => ipcRenderer.send("open-main-window"),
  // spellcheck dictionary
  syncDictionary: (words) => ipcRenderer.send("sync-dictionary", words),
  onDictAdd: (cb) => ipcRenderer.on("dict-add", (e, word) => cb(word)),
  // encrypted (OS-keychain) storage for the Supabase session / refresh token
  secureStore: {
    get: (key) => ipcRenderer.invoke("secure-get", key),
    set: (key, value) => ipcRenderer.invoke("secure-set", key, value),
    delete: (key) => ipcRenderer.invoke("secure-delete", key),
  },
  // OAuth: open the provider page in the system browser, receive the callback
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
  onAuthCallback: (cb) => ipcRenderer.on("auth-callback", (e, url) => cb(url)),
  rendererReady: () => ipcRenderer.send("renderer-ready"),
});
