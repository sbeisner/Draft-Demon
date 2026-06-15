// Electron main process: launches the FastAPI backend as a child process and
// opens a window pointing at the React frontend (dev server or built files).
const { app, BrowserWindow } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const http = require("http");

const isDev = !!process.env.ELECTRON_DEV;
const BACKEND_PORT = 8741;
const ROOT = path.join(__dirname, "..");
const BACKEND_DIR = path.join(ROOT, "backend");

let backend = null;
let win = null;

function pythonBin() {
  // Prefer a local virtualenv if the user made one; fall back to python3.
  const venv = path.join(BACKEND_DIR, ".venv", "bin", "python");
  return fs.existsSync(venv) ? venv : (process.env.PYTHON || "python3");
}

function startBackend() {
  backend = spawn(
    pythonBin(),
    ["-m", "uvicorn", "app:app", "--port", String(BACKEND_PORT)],
    { cwd: BACKEND_DIR, env: { ...process.env }, stdio: "inherit" }
  );
  backend.on("error", (e) => console.error("Backend failed to start:", e));
}

function waitForBackend(cb, tries = 0) {
  http
    .get(`http://localhost:${BACKEND_PORT}/api/health`, (res) => {
      res.resume();
      cb();
    })
    .on("error", () => {
      if (tries > 60) return cb(); // give up waiting, load anyway
      setTimeout(() => waitForBackend(cb, tries + 1), 500);
    });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 940,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#1b1c1f",
    webPreferences: { preload: path.join(__dirname, "preload.js") },
  });
  if (isDev) {
    win.loadURL("http://localhost:5173");
  } else {
    win.loadFile(path.join(ROOT, "frontend", "dist", "index.html"));
  }
}

app.whenReady().then(() => {
  startBackend();
  waitForBackend(() => createWindow());
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("quit", () => {
  if (backend) backend.kill();
});
