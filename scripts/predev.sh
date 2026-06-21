#!/usr/bin/env bash
# Preflight for `npm run dev` / `npm run dev:web`.
# Idempotent: makes a one-command boot reliable by ensuring deps are installed
# and no stale backend is holding the port. Skips work that's already done.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PORT=8741

# 1) Backend virtualenv + deps -------------------------------------------------
if [ ! -x "backend/.venv/bin/python" ]; then
  echo "==> Creating backend virtualenv (backend/.venv)"
  python3 -m venv backend/.venv
fi
# Install deps only when requirements.txt is newer than the last install marker.
STAMP="backend/.venv/.deps-installed"
if [ ! -f "$STAMP" ] || [ "backend/requirements.txt" -nt "$STAMP" ]; then
  echo "==> Installing backend dependencies"
  backend/.venv/bin/pip install --quiet --upgrade pip
  backend/.venv/bin/pip install --quiet -r backend/requirements.txt
  touch "$STAMP"
fi
# Seed the demo DB on first run.
if [ ! -f "backend/draftdemon.db" ]; then
  echo "==> Seeding demo project"
  ( cd backend && .venv/bin/python seed.py )
fi

# 2) Node deps -----------------------------------------------------------------
[ -d "node_modules" ] || { echo "==> npm install (root)"; npm install; }
[ -d "frontend/node_modules" ] || { echo "==> npm install (frontend)"; ( cd frontend && npm install ); }

# 3) Free a stale backend port -------------------------------------------------
# Only kill if the listener is our own uvicorn, so we never touch an unrelated app.
PID="$(lsof -ti "tcp:$PORT" 2>/dev/null || true)"
if [ -n "$PID" ]; then
  if ps -p "$PID" -o command= 2>/dev/null | grep -q "uvicorn"; then
    echo "==> Freeing stale backend on port $PORT (pid $PID)"
    kill "$PID" 2>/dev/null || true
    sleep 1
  else
    echo "!! Port $PORT is in use by another process (pid $PID); the backend may fail to start." >&2
  fi
fi

echo "==> Preflight OK"
