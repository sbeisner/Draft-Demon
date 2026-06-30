// Electron main process: launches the FastAPI backend as a child process,
// opens the main editor window, and manages a menu-bar tray icon.
const { app, BrowserWindow, Tray, Menu, MenuItem, ipcMain, nativeImage, session, safeStorage, shell } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const http = require("http");

const isDev = !!process.env.ELECTRON_DEV;
const BACKEND_PORT = 8741;
const ROOT = path.join(__dirname, "..");
// In a packaged build the backend/ and frontend/dist trees are shipped as
// extraResources under Contents/Resources; in dev they live in the repo root.
const RESOURCES = app.isPackaged ? process.resourcesPath : ROOT;
const BACKEND_DIR = path.join(RESOURCES, "backend");
// In a packaged build the backend is a standalone PyInstaller bundle (no Python
// required on the user's machine); in dev we run uvicorn from the repo backend.
const FROZEN_BACKEND = path.join(RESOURCES, "inkubus-backend", "inkubus-backend");
const FRONTEND_DIST = path.join(RESOURCES, "frontend", "dist");
const ICON_PATH = path.join(__dirname, "assets", "icon-1024.png");

// Public (non-secret) runtime config bundled with the app. Loaded into the
// process env at startup so BOTH the preload (frontend Supabase client) and the
// backend pick it up. Never put secrets (e.g. RESEND_API_KEY) here.
(function loadAppConfig() {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, "app-config.json"), "utf8"));
    for (const k of ["SUPABASE_URL", "SUPABASE_ANON_KEY"]) {
      if (cfg[k] && !process.env[k]) process.env[k] = cfg[k];
    }
  } catch { /* dev: values come from .env / Vite instead */ }
})();

let backend = null;
let mainWindow = null;
let tray = null;

// ---------- backend ----------
function pythonBin() {
  const venv = path.join(BACKEND_DIR, ".venv", "bin", "python");
  return fs.existsSync(venv) ? venv : (process.env.PYTHON || "python3");
}
function startBackend() {
  // SUPABASE_URL/ANON_KEY are already in process.env via loadAppConfig (or .env in dev).
  const env = { ...process.env, BACKEND_PORT: String(BACKEND_PORT) };
  if (app.isPackaged) {
    // Keep the installed app's data out of the dev repo: write the SQLite DB to
    // the app's userData dir (~/Library/Application Support/Inkubus) instead of
    // inside the read-only bundle (and away from dev's backend/draftdemon.db).
    const userData = app.getPath("userData");
    // On a fresh install this dir may not exist yet; SQLite won't create missing
    // parents, so make it ourselves or the backend dies on first launch.
    try { fs.mkdirSync(userData, { recursive: true }); } catch (e) { console.error("userData mkdir failed", e); }
    env.DRAFTDEMON_DB = path.join(userData, "draftdemon.db");
    // Capture the frozen backend's stdout/stderr to a log file. Launched from
    // Finder there's no console to inherit, so a crash would otherwise be
    // invisible — this gives us something to read when "can't reach backend".
    const logPath = path.join(userData, "backend.log");
    let stdio = "inherit";
    try {
      const fd = fs.openSync(logPath, "a");
      stdio = ["ignore", fd, fd];
    } catch (e) { console.error("backend log open failed", e); }
    // Standalone PyInstaller executable — no Python on the user's machine needed.
    backend = spawn(FROZEN_BACKEND, [], { env, stdio });
  } else {
    backend = spawn(pythonBin(), ["-m", "uvicorn", "app:app", "--port", String(BACKEND_PORT)],
      { cwd: BACKEND_DIR, env, stdio: "inherit" });
  }
  backend.on("error", (e) => console.error("Backend failed to start:", e));
}
function waitForBackend(cb, tries = 0) {
  http.get(`http://localhost:${BACKEND_PORT}/api/health`, (res) => { res.resume(); cb(); })
    .on("error", () => {
      if (tries > 60) return cb();
      setTimeout(() => waitForBackend(cb, tries + 1), 500);
    });
}

// ---------- windows ----------
function loadInto(win, page) {
  if (isDev) win.loadURL(`http://localhost:5173/${page}`);
  else win.loadFile(path.join(FRONTEND_DIST, page));
}
function showMain() {
  if (!mainWindow) {
    mainWindow = new BrowserWindow({
      width: 1280, height: 820, minWidth: 940,
      titleBarStyle: "hiddenInset", backgroundColor: "#17120f",
      icon: ICON_PATH, // taskbar/window icon on Windows & Linux
      webPreferences: { preload: path.join(__dirname, "preload.js") },
    });
    loadInto(mainWindow, "index.html");
    attachSpellcheckMenu(mainWindow);
    mainWindow.on("closed", () => { mainWindow = null; });
  }
  mainWindow.show();
  mainWindow.focus();
}

// ---------- spellcheck ----------
// Electron windows have no default context menu, so build one offering spelling
// suggestions, "Add to dictionary" (persisted to the project), and edit actions.
function attachSpellcheckMenu(win) {
  win.webContents.on("context-menu", (event, params) => {
    const menu = new Menu();
    for (const s of params.dictionarySuggestions) {
      menu.append(new MenuItem({ label: s, click: () => win.webContents.replaceMisspelling(s) }));
    }
    if (params.misspelledWord) {
      if (params.dictionarySuggestions.length) menu.append(new MenuItem({ type: "separator" }));
      menu.append(new MenuItem({
        label: `Add “${params.misspelledWord}” to dictionary`,
        click: () => {
          win.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord);
          win.webContents.send("dict-add", params.misspelledWord); // renderer persists to project
        },
      }));
    }
    if (params.isEditable || params.selectionText) {
      menu.append(new MenuItem({ type: "separator" }));
      if (params.isEditable) menu.append(new MenuItem({ role: "cut" }));
      menu.append(new MenuItem({ role: "copy" }));
      if (params.isEditable) menu.append(new MenuItem({ role: "paste" }));
      if (params.isEditable) menu.append(new MenuItem({ role: "selectAll" }));
    }
    if (menu.items.length) menu.popup();
  });
}

// Keep the spellchecker's custom words scoped to the active project: clear the
// previously-synced set and add the current project's words.
let syncedWords = [];
ipcMain.on("sync-dictionary", (e, words) => {
  const ses = session.defaultSession;
  try {
    syncedWords.forEach((w) => ses.removeWordFromSpellCheckerDictionary(w));
    (words || []).forEach((w) => ses.addWordToSpellCheckerDictionary(w));
    syncedWords = words || [];
  } catch (err) { /* native spellchecker differences are non-fatal */ }
});

// ---------- tray ----------
function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, "assets", "tray.png"));
  tray = new Tray(icon);
  tray.setToolTip("Draft Demon");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Open Draft Demon", click: showMain },
    { type: "separator" },
    { label: "Quit", click: () => { app.isQuitting = true; app.quit(); } },
  ]));
  tray.on("click", showMain); // left-click opens the main window
}

// ---------- secure token storage ----------
// Supabase's session (incl. the long-lived refresh token) is persisted here,
// encrypted at rest via the OS keychain (safeStorage), instead of in the
// renderer's localStorage where any injected script could read it. Backs the
// custom storage adapter in supabaseClient.js. Stored as { key: {e, v} } where
// `e` marks whether `v` (base64) is keychain-encrypted.
const SECURE_FILE = () => path.join(app.getPath("userData"), "secure-store.json");
function readSecure() {
  try { return JSON.parse(fs.readFileSync(SECURE_FILE(), "utf8")); } catch { return {}; }
}
function writeSecure(obj) {
  try { fs.writeFileSync(SECURE_FILE(), JSON.stringify(obj), { mode: 0o600 }); } catch (e) { console.error("secure write failed", e); }
}
ipcMain.handle("secure-get", (_e, key) => {
  const rec = readSecure()[key];
  if (!rec) return null;
  try {
    const buf = Buffer.from(rec.v, "base64");
    return rec.e ? safeStorage.decryptString(buf) : buf.toString("utf8");
  } catch { return null; }
});
ipcMain.handle("secure-set", (_e, key, value) => {
  const store = readSecure();
  const canEncrypt = safeStorage.isEncryptionAvailable();
  const buf = canEncrypt ? safeStorage.encryptString(String(value)) : Buffer.from(String(value), "utf8");
  store[key] = { e: canEncrypt, v: buf.toString("base64") };
  writeSecure(store);
  return true;
});
ipcMain.handle("secure-delete", (_e, key) => {
  const store = readSecure();
  delete store[key];
  writeSecure(store);
  return true;
});

// ---------- OAuth deep links (Apple/Google via Supabase) ----------
// The OAuth flow opens in the system browser and Supabase redirects back to
// draftdemon://auth-callback?code=... . We register that scheme, forward the
// callback URL to the renderer, and the renderer exchanges the code for a
// session. A callback that arrives before the window is ready is buffered.
let pendingAuthUrl = null;
function forwardAuthCallback(url) {
  if (!url || !url.startsWith("draftdemon://")) return;
  if (mainWindow && !mainWindow.webContents.isLoading()) {
    mainWindow.webContents.send("auth-callback", url);
    mainWindow.show();
    mainWindow.focus();
  } else {
    pendingAuthUrl = url;            // delivered once the window finishes loading
    showMain();
  }
}
app.setAsDefaultProtocolClient("draftdemon");
app.on("open-url", (event, url) => { event.preventDefault(); forwardAuthCallback(url); });

ipcMain.handle("open-external", (_e, url) => shell.openExternal(url));
// Renderer signals it's ready; flush any buffered auth callback.
ipcMain.on("renderer-ready", (e) => {
  if (pendingAuthUrl) { e.sender.send("auth-callback", pendingAuthUrl); pendingAuthUrl = null; }
});

// ---------- ipc ----------
ipcMain.on("open-main-window", showMain);

// ---------- lifecycle ----------
app.whenReady().then(() => {
  // Use the Inkubus sigil as the dock icon while running (dev/unpackaged).
  try { if (process.platform === "darwin" && app.dock) app.dock.setIcon(nativeImage.createFromPath(ICON_PATH)); } catch {}
  try { session.defaultSession.setSpellCheckerLanguages(["en-US"]); } catch {}
  // In dev (`npm run dev`), the backend is launched by the `dev:backend` script
  // and Electron only waits on it. Starting it here too would spawn a second
  // uvicorn on the same port and fail with "address already in use".
  if (!isDev) startBackend();
  waitForBackend(() => {
    showMain();
    createTray();
  });
  app.on("activate", () => { if (!mainWindow) showMain(); });
});

app.on("window-all-closed", () => {
  // Tray app: stay alive so the menu-bar item persists.
  if (process.platform !== "darwin") app.quit();
});
app.on("quit", () => { if (backend) backend.kill(); });
