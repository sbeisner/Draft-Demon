// Exposes the backend URL to the renderer. Kept minimal; the renderer talks to
// the backend over plain HTTP (CORS is open on localhost during dev).
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("DRAFTDEMON_API", "http://localhost:8741");
