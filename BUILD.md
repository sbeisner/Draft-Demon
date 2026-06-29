# Building the Inkubus macOS installer

Produces a self-contained, arm64 `Inkubus.dmg`. The Python backend is frozen with
PyInstaller, so **no Python is required on the end user's machine**.

## Prerequisites (one-time)

- macOS on Apple Silicon (arm64).
- Node deps installed at the repo root: `npm install`.
- A Python with **Pillow** for the icon (defaults to `/opt/anaconda3/bin/python3`;
  override with `PYTHON=…`). The backend build venv is created automatically.
- **For a signed + notarized DMG** (so it opens with no Gatekeeper warning on any Mac):
  1. A **Developer ID Application** certificate imported into your login keychain.
     (An "Apple Development" certificate is *not* sufficient for notarization.)
     Verify with: `security find-identity -v -p codesigning` — you should see a line
     like `"Developer ID Application: … (PDL24STF5H)"`.
  2. Notarytool credentials exported in the shell before building:
     ```sh
     export APPLE_ID="you@example.com"
     export APPLE_APP_SPECIFIC_PASSWORD="abcd-efgh-ijkl-mnop"   # appleid.apple.com → App-Specific Passwords
     export APPLE_TEAM_ID="PDL24STF5H"
     ```

## Build

```sh
npm run dist          # frozen backend → frontend → signed+notarized DMG in release/
```

Individual steps if you need them:
```sh
npm run build:backend # PyInstaller → backend/dist/inkubus-backend/
npm run make-icon     # regenerate electron/assets/icon.icns from the sigil
npm run dist:dir      # unsigned .app in release/mac-arm64/ (quick local check)
```

Notes:
- If no Developer ID cert is found, the build still succeeds but is **unsigned** — the
  `afterPack` hook skips backend signing and electron-builder skips app signing. Users
  would then need to right-click → Open once (or run
  `xattr -dr com.apple.quarantine /Applications/Inkubus.app`).
- The public Supabase URL + anon key are bundled in `electron/app-config.json` (both are
  client-safe). Secrets such as `RESEND_API_KEY` are **never** bundled.

## Verify a build

```sh
APP="release/mac-arm64/Inkubus.app"   # or mount the DMG
codesign --verify --deep --strict --verbose=2 "$APP"
spctl -a -t open --context context:primary-signature "$APP"   # → accepted (when notarized)
xcrun stapler validate release/Inkubus-*.dmg
```

Then install under a *different* macOS user account (or a Mac with no Python): the app
should launch, the backend should come up on `http://localhost:8741/api/health`, and data
is written to `~/Library/Application Support/Inkubus/`.
