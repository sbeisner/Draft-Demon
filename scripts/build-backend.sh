#!/usr/bin/env bash
# Build the standalone (PyInstaller) Inkubus backend used by the packaged app.
# Uses a dedicated arm64 build venv so only our real deps get frozen in.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/backend"
PY="${PYTHON:-/opt/anaconda3/bin/python3}"

if [ ! -x ".build-venv/bin/python" ]; then
  echo "==> creating build venv ($PY)"
  "$PY" -m venv .build-venv
  .build-venv/bin/pip install --quiet --upgrade pip
  .build-venv/bin/pip install --quiet -r requirements.txt pyinstaller
fi

echo "==> freezing backend"
rm -rf build dist
.build-venv/bin/pyinstaller --noconfirm inkubus-backend.spec
echo "==> built backend/dist/inkubus-backend/"
