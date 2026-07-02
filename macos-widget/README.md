# Draft Demon — native macOS widget

A real WidgetKit widget (the same kind as Apple's Weather/Calendar) showing
today's goal ring, your streak, Inkubus's mood, and the current phase. It can be
pinned to the **desktop** or **Notification Center** like any system widget, and
refreshes on the system timeline.

It reads the same backend as the main app (`GET http://localhost:8741/api/widget`),
so keep the Draft Demon app running for live data.

```
macos-widget/
├── project.yml            XcodeGen project definition (two targets)
├── Shared/
│   └── DraftDemonModel.swift     Codable model + backend fetch
├── App/
│   ├── DraftDemonCompanionApp.swift   tiny host app (required to ship a widget)
│   └── App.entitlements
├── Widget/
│   ├── DraftDemonWidget.swift          provider + SwiftUI views (small/medium)
│   ├── DraftDemonWidgetBundle.swift     @main bundle
│   ├── Info.plist
│   └── Widget.entitlements
└── Assets.xcassets/        InkubusNeutral + InkubusAngry artwork
```

> Why a "companion app"? Apple requires every widget to ship inside a host app —
> you can't distribute a standalone widget. The host here is intentionally tiny:
> it just hosts the widget and offers a "Reload" / "Test connection" button.

## Fastest path (XcodeGen)

```bash
brew install xcodegen            # once
cd macos-widget
xcodegen generate
open DraftDemon.xcodeproj
```

Then in Xcode:

1. Select the **DraftDemonCompanion** target → Signing & Capabilities → pick your
   Team. Do the same for **DraftDemonWidgetExtension** (it needs the same Team).
2. Choose the **DraftDemonCompanion** scheme and press ▶ Run once (this registers
   the widget with the system).
3. Right-click the desktop → **Edit Widgets** (or click the date/time in the menu
   bar to open Notification Center → Edit Widgets), find **Inkubus**, and drag
   the small or medium widget onto your desktop or Notification Center.

## Manual setup (no XcodeGen)

1. New Xcode project → macOS → App → name it `DraftDemonCompanion`
   (deployment target macOS 14.0).
2. File → New → Target → **Widget Extension**, name it
   `DraftDemonWidgetExtension`. Uncheck "Include Configuration Intent".
3. Delete the auto-generated widget Swift file and add the files from `Widget/`,
   `Shared/`, and the `Assets.xcassets` here. Add `Shared/DraftDemonModel.swift`
   to **both** targets (check both in the File Inspector → Target Membership).
4. For **both** targets, in Signing & Capabilities add **App Sandbox** and enable
   **Outgoing Connections (Client)** — or just use the provided `*.entitlements`.
5. In the widget extension's Info.plist add an **App Transport Security** entry
   with `NSAllowsLocalNetworking = YES` (already in `Widget/Info.plist`), so it can
   reach `http://localhost`.
6. Run the app target once, then add the widget from the gallery (step 3 above).

## Notes

- **Refresh cadence**: WidgetKit throttles updates (typically a few times/hour);
  this widget asks for a refresh every ~15 min. Use the host app's "Reload widget
  now" button to force an immediate update while testing.
- **Display-only**: system widgets can't host a live text field, so unlike the
  in-app/Electron widget there's no scratch box here — tapping the widget opens
  the app (`draftdemon://open`; wire that scheme in the Electron app to focus the
  editor, or it simply launches the companion).
- **Artwork**: swap `Assets.xcassets/Inkubus*.imageset` to restyle the mascot.
- I scaffolded this on a non-Mac environment, so it hasn't been compiled — expect
  to set your signing Team and possibly nudge a path on first open.
