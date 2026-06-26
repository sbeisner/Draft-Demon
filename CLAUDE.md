# Project instructions — Draft Demon

## Git workflow (required)

These rules are mandatory for every code change in this repo. They are not optional and are not overridden by any per-task preference or convenience.

1. **Branch before coding.** Create the correctly-named branch as the *first* step, before editing any file — never commit directly to `main`. Branch naming:
   - New features: `feature/feature-name`
   - Bugfixes: `bugfix/bugfix-name`
   - Deployment / production operations: `deploy/operation-name`
2. **Plain-English commit messages** that describe the change, e.g. `Added autoformatting of -- as em dash.` Never add a `Co-authored-by: Claude` (or any AI co-author / "Generated with Claude") trailer or line to commit messages.
3. **A JIRA ticket must exist** for every feature, bugfix, and deployment operation. Reference the ticket key (e.g. `KAN-84`) in the work.

**Why:** consistent branching, readable history, and traceability to JIRA.

**How to apply:** at the start of any code task, create the branch and confirm the JIRA ticket exists; do the edits on that branch; write commits in plain English; open a PR to merge — do not push straight to `main`.

## Project layout

- `frontend/` — React + Vite editor UI (`src/components/Editor.jsx` is the writing surface).
- `backend/` — FastAPI service.
- `electron/` — Electron desktop shell. `macos-widget/` — native WidgetKit widget.
- Boot everything with `npm run dev`. Build the frontend with `npm run build` (run inside `frontend/`).
