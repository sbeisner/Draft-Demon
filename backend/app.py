"""Draft Demon API — FastAPI over SQLite.

Run:  uvicorn app:app --reload --port 8741
"""
import re
import html as html_lib
from datetime import date, datetime
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import Base, engine, get_db, ensure_schema
import models
import engine as ge

Base.metadata.create_all(bind=engine)
ensure_schema()  # additively backfill columns added to models since the DB was created
app = FastAPI(title="Draft Demon API")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)


# ---- helpers -------------------------------------------------------------
_TAG_RE = re.compile(r"<[^>]+>")
_BLOCK_RE = re.compile(r"</(p|div|h1|h2|h3|blockquote|li)>|<br\s*/?>", re.I)


def strip_html(s: str) -> str:
    """Plain text from stored HTML (also fine for legacy plain text)."""
    s = _BLOCK_RE.sub("\n", s or "")   # block ends become line breaks (word separators)
    s = _TAG_RE.sub("", s)             # inline tags removed so "dawn</i>." stays one token
    return html_lib.unescape(s)


def count_words(text: str) -> int:
    text = strip_html(text).strip()
    return len(text.split()) if text else 0


def total_words(p: models.Project) -> int:
    # Only chapters marked for the manuscript count toward the goal; planning /
    # outline sheets (excluded) don't inflate progress.
    return sum(s.words for s in p.sheets if s.include_in_manuscript)


_PLACEHOLDER_RE = re.compile(r"\[([^\[\]\n]{1,120})\]")
TASK_XP = 20  # small reward for checking a box


def find_placeholders(p: models.Project) -> list:
    """Scan every chapter for [bracketed placeholders] — Jenn Lyons' trick for
    leaving 'fix this later' notes inline. They surface as a live to-do list and
    vanish automatically once the brackets are removed from the text."""
    out = []
    for s in sorted(p.sheets, key=lambda x: x.position):
        text = strip_html(s.text)
        for m in _PLACEHOLDER_RE.finditer(text):
            out.append({"sheet_id": s.id, "sheet_title": s.title, "text": m.group(1).strip()})
    return out


def serialize(p: models.Project) -> dict:
    t = total_words(p)
    st = ge.compute_state(p, t)
    return {
        "id": p.id, "title": p.title, "subtitle": p.subtitle,
        "target": p.target, "deadline": p.deadline.isoformat(),
        "start_date": p.start_date.isoformat(), "days_per_week": p.days_per_week,
        "xp": p.xp, "lifetime_words": p.lifetime_words, "streak": p.streak,
        "badges": p.badges or {}, "milestones_done": p.milestones_done or {},
        "sheets": [{"id": s.id, "title": s.title, "text": s.text, "words": s.words,
                    "include": s.include_in_manuscript} for s in p.sheets],
        "cuts": [{"id": c.id, "sheet_title": c.sheet_title, "text": c.text,
                  "words": c.words, "created": c.created} for c in p.cuts],
        "tasks": [{"id": t.id, "text": t.text, "done": t.done} for t in p.tasks],
        "placeholders": find_placeholders(p),
        "phases": ge.PHASES,
        "badge_defs": [{"id": b["id"], "icon": b["icon"], "name": b["name"]} for b in ge.BADGES],
        "state": st,
    }


def get_project(db: Session, pid: int) -> models.Project:
    p = db.get(models.Project, pid)
    if not p:
        raise HTTPException(404, "Project not found")
    return p


# ---- schemas -------------------------------------------------------------
class ProjectIn(BaseModel):
    title: str = "Untitled Project"
    subtitle: str = "Novel"
    target: int = 80000
    deadline: str
    days_per_week: int = 5


class SheetSave(BaseModel):
    text: str
    title: str | None = None


class SheetIn(BaseModel):
    title: str = "Untitled"


class CutIn(BaseModel):
    sheet_title: str = ""
    text: str = ""


class MilestoneIn(BaseModel):
    index: int
    done: bool


# ---- routes --------------------------------------------------------------
@app.get("/api/projects")
def list_projects(db: Session = Depends(get_db)):
    return [serialize(p) for p in db.query(models.Project).all()]


@app.post("/api/projects")
def create_project(body: ProjectIn, db: Session = Depends(get_db)):
    p = models.Project(
        title=body.title, subtitle=body.subtitle, target=body.target,
        deadline=date.fromisoformat(body.deadline), start_date=date.today(),
        days_per_week=body.days_per_week, badges={}, milestones_done={}, daily_log={},
    )
    p.sheets.append(models.Sheet(title="Chapter 1", text="", words=0, position=0))
    db.add(p)
    db.commit()
    db.refresh(p)
    return serialize(p)


@app.put("/api/projects/{pid}/goal")
def update_goal(pid: int, body: ProjectIn, db: Session = Depends(get_db)):
    p = get_project(db, pid)
    p.title, p.subtitle = body.title, body.subtitle
    p.target = body.target
    p.deadline = date.fromisoformat(body.deadline)
    p.days_per_week = body.days_per_week
    db.commit()
    db.refresh(p)
    return serialize(p)


@app.delete("/api/projects/{pid}")
def delete_project(pid: int, db: Session = Depends(get_db)):
    db.delete(get_project(db, pid))
    db.commit()
    return {"ok": True}


@app.post("/api/projects/{pid}/sheets")
def add_sheet(pid: int, body: SheetIn, db: Session = Depends(get_db)):
    p = get_project(db, pid)
    pos = len(p.sheets)
    s = models.Sheet(project_id=p.id, title=body.title or f"Chapter {pos + 1}", position=pos)
    p.sheets.append(s)
    db.commit()
    db.refresh(p)
    return serialize(p)


@app.delete("/api/projects/{pid}/sheets/{sid}")
def delete_sheet(pid: int, sid: int, db: Session = Depends(get_db)):
    """Delete a chapter. Any written content is preserved in Cuts first, so
    removing a chapter is recoverable — same philosophy as stashing. The
    committed baseline is lowered to match, so this never registers as the
    destructive case (no doubled penalty, no streak break). The chapter's words
    do lose their XP credit, though: they've left the draft, and keeping the XP
    would make deleting-and-rewriting a free way to farm levels."""
    p = get_project(db, pid)
    sheet = next((s for s in p.sheets if s.id == sid), None)
    if not sheet:
        raise HTTPException(404, "Sheet not found")

    old_total = total_words(p)
    today = ge.today_key()
    if p.baseline_date != today:               # roll the day forward first
        p.baseline_date = today
        p.baseline_words = old_total
        p.cut_debt = 0

    removed_words = sheet.words
    # preserve any written words so the deletion isn't destructive
    if sheet.words > 0:
        p.cuts.append(models.Cut(
            project_id=p.id, sheet_title=sheet.title, text=sheet.text,
            words=sheet.words, created=datetime.now().isoformat(timespec="minutes")))

    p.sheets.remove(sheet)                      # delete-orphan removes the row
    for i, s in enumerate(p.sheets):           # re-pack positions
        s.position = i

    # lower the committed line so the shrink isn't counted as destruction
    new_total = total_words(p)
    p.baseline_words = min(p.baseline_words, new_total)
    p.cut_debt = max(0, p.baseline_words - new_total)
    p.daily_log[today] = new_total - p.baseline_words

    # un-credit the deleted chapter's XP (gentle: 1:1, no penalty, no streak break)
    uncredited = min(p.xp, removed_words)
    p.xp -= uncredited

    db.commit()
    db.refresh(p)
    out = serialize(p)
    out["uncredited"] = uncredited
    return out


@app.put("/api/projects/{pid}/sheets/{sid}")
def save_sheet(pid: int, sid: int, body: SheetSave, db: Session = Depends(get_db)):
    """Core write path. Recomputes words and runs the accounting engine."""
    p = get_project(db, pid)
    sheet = next((s for s in p.sheets if s.id == sid), None)
    if not sheet:
        raise HTTPException(404, "Sheet not found")

    old_total = total_words(p)
    if body.title is not None:
        sheet.title = body.title
    sheet.text = body.text
    sheet.words = count_words(body.text)
    new_total = total_words(p)

    event = ge.apply_word_change(p, old_total, new_total)
    earned = ge.check_badges(p, new_total)
    db.commit()
    db.refresh(p)
    out = serialize(p)
    out["event"] = {**event, "badges_earned": earned}
    return out


class StashIn(BaseModel):
    new_text: str          # sheet text AFTER the removal
    removed_text: str      # the chunk being stashed


@app.put("/api/projects/{pid}/sheets/{sid}/stash")
def stash_from_sheet(pid: int, sid: int, body: StashIn, db: Session = Depends(get_db)):
    """Remove a chunk from a sheet and preserve it in Cuts — penalty-free.

    Because the words are preserved (not destroyed), this lowers the committed
    baseline by the amount removed instead of registering it as clawing back
    past work. The words' XP credit is removed (they've left the draft, so they
    can't keep counting — otherwise stashing would be a free XP farm), but it's
    a plain 1:1 un-credit: no doubled penalty and no broken streak. That's the
    whole point — give 'this is terrible' a safe, gentle outlet."""
    p = get_project(db, pid)
    sheet = next((s for s in p.sheets if s.id == sid), None)
    if not sheet:
        raise HTTPException(404, "Sheet not found")

    old_total = total_words(p)
    today = ge.today_key()
    if p.baseline_date != today:               # roll the day forward first
        p.baseline_date = today
        p.baseline_words = old_total
        p.cut_debt = 0

    # preserve the chunk
    c = models.Cut(project_id=p.id, sheet_title=sheet.title, text=body.removed_text,
                   words=count_words(body.removed_text),
                   created=datetime.now().isoformat(timespec="minutes"))
    p.cuts.append(c)

    # apply the shrink, then lower the committed line so it isn't "destruction"
    sheet.text = body.new_text
    sheet.words = count_words(body.new_text)
    new_total = total_words(p)
    p.baseline_words = min(p.baseline_words, new_total)
    p.cut_debt = max(0, p.baseline_words - new_total)   # -> 0
    p.daily_log[today] = new_total - p.baseline_words

    # un-credit the stashed words' XP (gentle: 1:1, no penalty, no streak break)
    uncredited = min(p.xp, c.words)
    p.xp -= uncredited

    db.commit()
    db.refresh(p)
    out = serialize(p)
    out["event"] = {"penalty_xp": 0, "broke_streak": False, "cut_into_past": 0,
                    "goal_met_now": False, "stashed": c.words, "uncredited": uncredited,
                    "badges_earned": []}
    return out


@app.post("/api/projects/{pid}/cuts")
def add_cut(pid: int, body: CutIn, db: Session = Depends(get_db)):
    """Stash text in the Cuts bin — non-destructive removal. Stashing does NOT
    penalize: the words leave the manuscript, so daily progress falls, but
    because they're preserved this isn't 'destroying' work. The penalty only
    fires when the manuscript total drops below a *past day's* committed line."""
    p = get_project(db, pid)
    c = models.Cut(project_id=p.id, sheet_title=body.sheet_title, text=body.text,
                   words=count_words(body.text), created=datetime.now().isoformat(timespec="minutes"))
    p.cuts.append(c)
    db.commit()
    db.refresh(p)
    return serialize(p)


@app.post("/api/projects/{pid}/cuts/{cid}/restore")
def restore_cut(pid: int, cid: int, db: Session = Depends(get_db)):
    """Pop a cut from the bin and hand its text back so the UI can place it
    (copied to clipboard) wherever the writer wants."""
    p = get_project(db, pid)
    c = next((c for c in p.cuts if c.id == cid), None)
    text = c.text if c else ""
    if c:
        db.delete(c)
        db.commit()
        db.refresh(p)
    out = serialize(p)
    out["restored_text"] = text
    return out


class IncludeIn(BaseModel):
    include: bool


@app.put("/api/projects/{pid}/sheets/{sid}/include")
def set_include(pid: int, sid: int, body: IncludeIn, db: Session = Depends(get_db)):
    """Mark a chapter included/excluded from the manuscript. Toggling shifts the
    locked baseline by the same amount the total changes, so flipping a planning
    sheet in or out never awards XP nor triggers the deletion penalty."""
    p = get_project(db, pid)
    sheet = next((s for s in p.sheets if s.id == sid), None)
    if not sheet:
        raise HTTPException(404, "Sheet not found")

    old_total = total_words(p)
    sheet.include_in_manuscript = body.include
    new_total = total_words(p)

    today = ge.today_key()
    if p.baseline_date != today:
        p.baseline_date = today
        p.baseline_words = old_total
        p.cut_debt = 0
    p.baseline_words = max(0, p.baseline_words + (new_total - old_total))
    p.cut_debt = max(0, p.baseline_words - new_total)
    p.daily_log[today] = new_total - p.baseline_words
    db.commit()
    db.refresh(p)
    return serialize(p)


class TaskIn(BaseModel):
    text: str = ""


class TaskUpdateIn(BaseModel):
    text: str | None = None
    done: bool | None = None


@app.post("/api/projects/{pid}/tasks")
def add_task(pid: int, body: TaskIn, db: Session = Depends(get_db)):
    p = get_project(db, pid)
    t = models.Task(project_id=p.id, text=body.text.strip(), position=len(p.tasks),
                    created=datetime.now().isoformat(timespec="minutes"))
    p.tasks.append(t)
    db.commit()
    db.refresh(p)
    return serialize(p)


@app.put("/api/projects/{pid}/tasks/{tid}")
def update_task(pid: int, tid: int, body: TaskUpdateIn, db: Session = Depends(get_db)):
    p = get_project(db, pid)
    t = next((t for t in p.tasks if t.id == tid), None)
    if not t:
        raise HTTPException(404, "Task not found")
    event = {"task_done": False, "xp_delta": 0}
    if body.text is not None:
        t.text = body.text.strip()
    if body.done is not None and body.done != t.done:
        t.done = body.done
        # checking a box rewards XP; un-checking gives it back (no farming gain)
        delta = TASK_XP if t.done else -TASK_XP
        p.xp = max(0, p.xp + delta)
        event = {"task_done": t.done, "xp_delta": delta}
    db.commit()
    db.refresh(p)
    out = serialize(p)
    out["event"] = event
    return out


@app.delete("/api/projects/{pid}/tasks/{tid}")
def delete_task(pid: int, tid: int, db: Session = Depends(get_db)):
    p = get_project(db, pid)
    t = next((t for t in p.tasks if t.id == tid), None)
    if t:
        db.delete(t)
        db.commit()
        db.refresh(p)
    return serialize(p)


@app.put("/api/projects/{pid}/milestone")
def set_milestone(pid: int, body: MilestoneIn, db: Session = Depends(get_db)):
    p = get_project(db, pid)
    ms = dict(p.milestones_done or {})
    ms[str(body.index)] = body.done
    p.milestones_done = ms
    db.commit()
    db.refresh(p)
    return serialize(p)


@app.get("/api/health")
def health():
    return {"ok": True}
