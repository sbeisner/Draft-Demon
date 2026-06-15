"""Goal engine — pure, testable functions. No DB, no framework.

`compute_state` turns a project's raw numbers into the live targets and pace
the UI shows. `apply_word_change` is the accounting brain that decides how an
edit affects XP, streak, daily progress, and the deletion penalty.
"""
from datetime import date, datetime, timedelta

WORDS_PER_PAGE = 250
MIN_DAILY = 50          # never nag for less than this
PENALTY_MULTIPLIER = 2  # destroying committed work hurts 2x what writing it earned

# How the manuscript is divided into qualitative milestones. `end` is the
# fraction of the target word count at which the phase is considered complete.
PHASES = [
    {"name": "Outline & structure", "task": "Outline the story — beats, characters, the shape of Act 1", "end": 0.0},
    {"name": "Act 1 — Setup",        "task": "Draft Act 1: establish world, character, and the inciting incident", "end": 0.25},
    {"name": "Act 2 — Confrontation","task": "Draft Act 2: rising complications through the midpoint turn", "end": 0.65},
    {"name": "Act 3 — Resolution",   "task": "Draft Act 3: build to the climax and resolve it", "end": 0.95},
    {"name": "Final push",           "task": "Finish the draft — close the remaining scenes", "end": 1.0},
]


def today_key(d: date | None = None) -> str:
    return (d or date.today()).isoformat()


def writing_days_between(from_key: str, to_key: str, days_per_week: int) -> int:
    """Approximate number of *writing* days in a span, given a weekly cadence."""
    a = datetime.fromisoformat(from_key).date()
    b = datetime.fromisoformat(to_key).date()
    if b <= a:
        return 0
    total = (b - a).days
    return max(1, round(total * (days_per_week / 7)))


def current_phase(total_words: int, target: int) -> int:
    if total_words <= 0:
        return 0
    frac = total_words / target if target else 1
    for i in range(1, len(PHASES)):
        if frac < PHASES[i]["end"]:
            return i
    return len(PHASES) - 1


def level_for(xp: int) -> dict:
    """1 level per ~2000 XP, escalating 25% each level."""
    xp = max(0, xp)
    lvl, need, acc = 1, 2000, 0
    while xp >= acc + need:
        acc += need
        lvl += 1
        need = round(need * 1.25)
    return {"level": lvl, "into": xp - acc, "need": need}


def compute_state(p, total_words: int, on: str | None = None) -> dict:
    """Derive everything the UI needs from the stored numbers."""
    on = on or today_key()
    remaining = max(0, p.target - total_words)
    days_left = writing_days_between(on, p.deadline.isoformat(), p.days_per_week)
    daily_goal = 0 if remaining == 0 else max(MIN_DAILY, -(-remaining // max(1, days_left)))

    # in-deficit means today's manuscript is below today's locked baseline
    in_deficit = p.cut_debt > 0
    wrote_today = max(0, p.daily_log.get(on, 0)) if not in_deficit else 0
    day_pct = 100 if daily_goal == 0 else min(100, round(wrote_today / daily_goal * 100))
    overall_pct = min(100, round(total_words / p.target * 100)) if p.target else 0

    # pace vs an even burn-down from the start date
    span_total = writing_days_between(p.start_date.isoformat(), p.deadline.isoformat(), p.days_per_week)
    span_done = writing_days_between(p.start_date.isoformat(), on, p.days_per_week)
    expected = round(p.target * min(1, span_done / max(1, span_total)))
    pace = total_words - expected

    phase_idx = current_phase(total_words, p.target)
    phase = PHASES[phase_idx]
    if remaining == 0:
        task = "🎉 Draft complete — time to revise!"
    elif phase_idx == 0 and not p.daily_log:
        task = PHASES[0]["task"]
    else:
        task = phase["task"]

    return {
        "total_words": total_words,
        "remaining": remaining,
        "days_left": days_left,
        "daily_goal": daily_goal,
        "wrote_today": wrote_today,
        "day_pct": day_pct,
        "overall_pct": overall_pct,
        "pace": pace,
        "phase_idx": phase_idx,
        "phase_name": phase["name"],
        "task": task,
        "in_deficit": in_deficit,
        "cut_debt": p.cut_debt,
        "level": level_for(p.xp),
        "pages_per_day": round(daily_goal / WORDS_PER_PAGE, 1),
    }


def apply_word_change(p, old_total: int, new_total: int, on: str | None = None) -> dict:
    """The accounting brain. Mutates the project's gamification fields in place
    based on a manuscript total going old_total -> new_total today.

    Returns an event dict the API surfaces to the UI (penalties, streak hits…).
    """
    on = on or today_key()
    event = {"penalty_xp": 0, "broke_streak": False, "cut_into_past": 0, "goal_met_now": False}

    # New day? Lock yesterday's surviving total as today's baseline.
    if p.baseline_date != on:
        p.baseline_date = on
        p.baseline_words = old_total
        p.cut_debt = 0

    delta = new_total - old_total

    if delta > 0:
        # Words added — always earns XP and lifetime credit.
        p.lifetime_words += delta
        p.xp += delta

    # Today's net progress above the locked baseline.
    net_today = new_total - p.baseline_words
    p.daily_log[on] = net_today  # may be negative; compute_state floors display at 0

    # Are we below the baseline (eating into committed past work)?
    cut_below = max(0, p.baseline_words - new_total)
    if cut_below > p.cut_debt:
        # Newly destroyed committed work -> penalty.
        newly_cut = cut_below - p.cut_debt
        penalty = newly_cut * PENALTY_MULTIPLIER
        p.xp = max(0, p.xp - penalty)
        event["penalty_xp"] = penalty
        event["cut_into_past"] = newly_cut
        if p.streak > 0 or p.last_met_day == on:
            event["broke_streak"] = True
        p.streak = 0
        p.last_met_day = None
    p.cut_debt = cut_below

    # Streak: met today's goal? (only possible when not in deficit)
    if p.cut_debt == 0:
        from_state = compute_state(p, new_total, on)
        if from_state["daily_goal"] > 0 and net_today >= from_state["daily_goal"] and p.last_met_day != on:
            yesterday = today_key(date.fromisoformat(on) - timedelta(days=1))
            p.streak = p.streak + 1 if p.last_met_day == yesterday else 1
            p.last_met_day = on
            event["goal_met_now"] = True

    return event


# ---- Badges --------------------------------------------------------------
BADGES = [
    {"id": "first",   "icon": "✍️", "name": "First words",  "test": lambda p, t: t > 0},
    {"id": "streak3", "icon": "🔥", "name": "3-day streak", "test": lambda p, t: p.streak >= 3},
    {"id": "streak7", "icon": "⚡", "name": "7-day streak", "test": lambda p, t: p.streak >= 7},
    {"id": "k10",     "icon": "📖", "name": "10k words",    "test": lambda p, t: t >= 10000},
    {"id": "k50",     "icon": "🏔️", "name": "50k words",    "test": lambda p, t: t >= 50000},
    {"id": "half",    "icon": "🌗", "name": "Halfway",      "test": lambda p, t: t >= p.target / 2},
    {"id": "noDelete","icon": "🛡️", "name": "Kept the faith","test": lambda p, t: p.lifetime_words >= 5000 and p.cut_debt == 0},
    {"id": "done",    "icon": "🏆", "name": "Draft done",   "test": lambda p, t: t >= p.target},
]


def check_badges(p, total_words: int) -> list[str]:
    earned = []
    badges = dict(p.badges or {})
    for b in BADGES:
        if not badges.get(b["id"]) and b["test"](p, total_words):
            badges[b["id"]] = True
            earned.append(b["name"])
    p.badges = badges
    return earned
