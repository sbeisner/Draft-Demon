#!/usr/bin/env bash
# Build electron/assets/icon.icns from the rendered 1024px sigil icon.
# Regenerates the source PNG first (needs a Python with Pillow), then uses the
# macOS built-ins sips + iconutil to emit a multi-resolution .icns.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ASSETS="$ROOT/electron/assets"
SRC="$ASSETS/icon-1024.png"
ICONSET="$ASSETS/icon.iconset"
PY="${PYTHON:-/opt/anaconda3/bin/python3}"

echo "==> rendering source PNG"
"$PY" "$ROOT/scripts/make-icon.py"

echo "==> building iconset"
rm -rf "$ICONSET"
mkdir -p "$ICONSET"
for s in 16 32 128 256 512; do
  sips -z $s $s        "$SRC" --out "$ICONSET/icon_${s}x${s}.png"      >/dev/null
  sips -z $((s*2)) $((s*2)) "$SRC" --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
done

echo "==> building icns"
iconutil -c icns "$ICONSET" -o "$ASSETS/icon.icns"
rm -rf "$ICONSET"
echo "==> wrote $ASSETS/icon.icns"
