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
bash setup.sh        # makes a venv, installs deps, seeds a demo project

npm run dev          # launches the full desktop app (Electron)
# or
npm run dev:web      # backend + browser version at http://localhost:5173
```

`npm run dev` starts the FastAPI backend (port 8741), the Vite dev server
(5173), and Electron once both are up.

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

## Notes / next steps

- **macOS desktop widget**: the natural next piece — a WidgetKit/menu-bar widget
  showing today's goal, streak, and Inkubus's current mood. It would read the same API.
- **Packaging**: `npm run build:frontend` produces the static bundle; wrapping it
  into a distributable `.app` (electron-builder) is a follow-up.
- The SQLite file is `backend/draftdemon.db` — delete it to reset all data.
