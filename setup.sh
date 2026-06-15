#!/usr/bin/env bash
# One-time setup for Draft Demon. Run from the "Draft Demon/" folder:  bash setup.sh
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"

echo "==> Python backend (virtualenv in backend/.venv)"
cd backend
python3 -m venv .venv
./.venv/bin/pip install --upgrade pip >/dev/null
./.venv/bin/pip install -r requirements.txt
./.venv/bin/python seed.py        # create the demo project
cd ..

echo "==> Frontend deps"
cd frontend && npm install && cd ..

echo "==> Electron + dev tooling"
npm install

echo ""
echo "Setup complete. Start the app with:"
echo "   npm run dev        # full desktop app (Electron)"
echo "   npm run dev:web    # backend + browser at http://localhost:5173"
