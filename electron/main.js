// Electron main process: launches the FastAPI backend as a child process,
// opens the main editor window, and manages a menu-bar tray icon.
const { app, BrowserWindow, Tray, Menu, MenuItem, ipcMain, nativeImage, session } = require("electron");
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
const FRONTEND_DIST = path.join(RESOURCES, "frontend", "dist");
const ICON_PATH = path.join(__dirname, "assets", "icon.png");

let backend = null;
let mainWindow = null;
let tray = null;

// ---------- backend ----------
function pythonBin() {
  const venv = path.join(BACKEND_DIR, ".venv", "bin", "python");
  return fs.existsSync(venv) ? venv : (process.env.PYTHON || "python3");
}
function startBackend() {
  const env = { ...process.env };
  if (app.isPackaged) {
    // Keep the installed app's data out of the dev repo: write the SQLite DB to
    // the app's userData dir (~/Library/Application Support/Draft Demon) instead
    // of inside the read-only bundle (and away from dev's backend/draftdemon.db).
    env.DRAFTDEMON_DB = path.join(app.getPath("userData"), "draftdemon.db");
  }
  backend = spawn(pythonBin(), ["-m", "uvicorn", "app:app", "--port", String(BACKEND_PORT)],
    { cwd: BACKEND_DIR, env, stdio: "inherit" });
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

// ---------- ipc ----------
ipcMain.on("open-main-window", showMain);

// ---------- lifecycle ----------
app.whenReady().then(() => {
  // Use the Draft Demon logo as the dock icon while running (dev/unpackaged).
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
