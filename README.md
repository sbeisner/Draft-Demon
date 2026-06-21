# Draft Demon 🔥

A goal-aligned writing app, in the spirit of Ulysses but built to keep you honest
about your goals. Set a target ("a 200k-word novel, draft done in a year") and
Draft Demon turns it into a daily word goal and a phase-by-phase plan, with a
Duolingo-style streak/XP layer to keep momentum — and guardrails against the
classic "this is all terrible, delete everything" spiral.

Your companion is **Inkubus**, the Draft Demon mascot. He has two moods:

- 😈 **Happy Inkubus** — you're on track, ahead of pace, or you just hit today's goal.
- 👿 **Angry Inkubus** — you've fallen behind, or you're clawing back words you
  already committed on earlier days.

## Architecture

```
Draft Demon/
├── backend/        FastAPI + SQLite. The goal engine and word-accounting live here.
│   ├── app.py        REST API
│   ├── engine.py     pure goal-math + the anti-deletion accounting (easy to test/modify)
│   ├── models.py     SQLAlchemy models
│   ├── database.py   DB setup
│   └── seed.py       creates a demo project
├── frontend/       React + Vite. Three-pane UI, editor, goals/gamification panel.
│   ├── public/       Inkubus artwork + logo (inkubus-happy.png, inkubus-angry.png, draft-demon-logo.png)
│   └── src/
│       ├── App.jsx
│       ├── api.js
│       └── components/  Editor, GoalsPanel, GoalModal, Inkubus
└── electron/       Electron shell that runs backend + loads the frontend.
```

The pieces are decoupled: the backend is a plain HTTP API, the frontend is a
normal Vite app, and Electron just wraps them. Iterate on any layer
independently, swap the frontend for Vue, or point a future mobile app at the
same API.

## Run it

Requires **Python 3.10+** and **Node 18+**.

```bash
cd "Draft Demon"
npm run dev          # launches the full desktop app (Electron)
# or
npm run dev:web      # backend + browser version at http://localhost:5173
```

That's it — one command. A preflight (`scripts/predev.sh`) runs automatically
before `dev`/`dev:web`: it creates the backend virtualenv, installs Python and
Node deps (only when they change), seeds the demo project on first run, and
frees a stale backend port if one is held. Re-runs are an instant no-op.

`npm run dev` then starts the FastAPI backend (port 8741), the Vite dev server
(5173), and Electron once both are up. The backend is owned by the dev script,
so Electron only launches its own backend in a packaged build (`npm start`).

## Inkubus artwork

The two moods and the logo live in `frontend/public/`:
`inkubus-happy.png`, `inkubus-angry.png`, `draft-demon-logo.png`. Swap those
files to restyle the mascot — no code changes needed. If a file is missing, a
built-in SVG version of Inkubus renders as a fallback (`components/Inkubus.jsx`).

## The goal engine (`backend/engine.py`)

- **Daily goal** = remaining words ÷ remaining writing days, recomputed every
  day. Bank words ahead and tomorrow's target drops; fall behind and it rises.
- **Pace** compares your total against an even burn-down from your start date.
- **Phases** (Outline → Act 1 → Act 2 → Act 3 → Final push) map word-count
  fractions to a qualitative daily focus like "Draft Act 2: the midpoint turn".
- **Levels / XP / streak / badges** form the motivation layer.

## The anti-deletion model

Only **surviving** words count, and destroying committed work has consequences
(and angers Inkubus):

- **`lifetime_words` / XP** are earned on words *added*. Writing is always rewarded.
- **Daily progress** counts only net-new words above *today's locked baseline*
  (the manuscript size at the start of the day). Deleting words you wrote **today**
  just lowers today's number toward zero — normal editing, no penalty.
- **Cutting into earlier days' work** (dropping below the locked baseline) is the
  trap. It triggers a **−2 XP per word penalty** and **resets your streak**, the UI
  shows a deficit warning, and Inkubus turns angry until you climb back.
- **Cuts (the safe outlet).** A big deletion (25+ words at once) is intercepted with
  a prompt: *stash it* or *delete it*. Stashing moves the text to the **Cuts bin** —
  preserved, penalty-free (it lowers the committed baseline instead of counting as
  destruction). Restoring copies it back to your clipboard.

This lives in `apply_word_change` and the `/stash` endpoint.

## Writing suite

- **Rich text.** The editor is a formatted surface — bold, italic, underline,
  headings, blockquotes, and a centered `#` scene break (toolbar above the page).
  Content is stored as HTML; word counts strip the markup so formatting never
  inflates your numbers.
- **Include / exclude chapters.** Each chapter has an **In manuscript / Excluded**
  toggle. Excluded sheets are for planning, outlines, or notes — they don't count
  toward your word goal and aren't compiled. Toggling is goal-neutral: it never
  awards XP or trips the deletion penalty (the locked baseline shifts with it).
- **Compile to manuscript.** The **📄 Compile** button assembles every *included*
  chapter, in order, into a standard manuscript-format `.docx` (Shunn-style: 1"
  margins, 12pt Times New Roman, double-spaced, first-line indents, a title page
  with contact info + approximate word count, a `Surname / TITLE / page` running
  header, chapters on new pages, centered `#` scene breaks). Set your pen name in
  the project's **Author name** field (goal dialog) for the title page/header.

Backed by `backend/compile.py` (HTML→DOCX via python-docx) and
`GET /api/projects/{id}/compile.docx`.

### Spell-check & project dictionary

- **Red squiggles** come from the built-in spellchecker on the editor surface.
- **Right-click a misspelling** for suggestions (click one to replace it) plus
  **Add to dictionary** and cut/copy/paste. The context menu is built in the
  Electron main process (`electron/main.js`, the `context-menu` handler).
- **Per-project dictionary.** Added words persist on the project
  (`POST/DELETE /api/projects/{id}/dictionary`) and are synced into the
  spellchecker whenever you switch projects, so character names and invented
  terms stop getting flagged — scoped to that project. Manage the word list
  (add/remove chips) in the project's goal/settings dialog.
- *macOS note:* macOS uses the system spellchecker, so a custom word may be
  remembered system-wide rather than strictly per-project, and exact suggestion
  behavior can differ from Windows/Linux. The right-click correct/add flow works
  regardless. (This part wasn't compile-tested on a Mac — see notes below.)

## Desktop widget

A floating, always-on-top mini panel plus a menu-bar (tray) icon — the
Duolingo-style nudge. It launches with the app and shows today's goal ring,
streak, Inkubus's current mood, and the current phase/task.

- **Menu-bar icon** (tray): left-click toggles the widget; right-click for
  Show/hide widget · Open Draft Demon · Quit.
- **Live scratch field**: jot words straight into the widget — they save to a
  `⚡ Scratchpad` sheet in the active project, so they count toward today's goal
  (updating streak + Inkubus's mood) and sync into your manuscript.
- **Open Draft Demon**: brings the full editor to the front.
- Auto-refreshes every minute, stays always-on-top, and remembers where you
  drag it (`widget-bounds.json` in the app's userData folder).

It's a second Vite entry (`frontend/widget.html` → `src/components/Widget.jsx`)
and reads `GET /api/widget`. The main window and widget stay in sync via
`GET/PUT /api/state` (which project is active).

## Notes / next steps

- **Packaging**: `npm run build:frontend` produces the static bundles; wrapping
  into a distributable `.app` (electron-builder) is a follow-up.
- The SQLite file is `backend/draftdemon.db` — delete it to reset all data.
