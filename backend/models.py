"""Data model.

Key idea behind the anti-deletion design:

* `lifetime_words`  — gross words ever ADDED to the manuscript. Never goes down.
                      An honesty stat ("words ever written"); does NOT drive XP.
* `xp`              — tracks words you've actually KEPT. Adding words earns XP;
                      removing them un-credits it (down to a floor of 0) so you
                      can't paste/delete/repeat to farm levels. Removing today's
                      own work is a plain 1:1 un-credit (normal editing); cutting
                      *committed past work* costs an extra penalty (see cut_debt).
* `baseline_words`  — the manuscript's total word count at the START of today.
                      Everything at/below this line is "committed" past work.
* daily progress    — counts only NET NEW words above today's baseline. Deleting
                      words you wrote *today* just lowers today's number toward 0
                      (no penalty — that's normal editing).
* cut_debt          — how far the manuscript currently sits BELOW today's baseline,
                      i.e. how much committed past work you've clawed back. Digging
                      deeper here is the "delete everything" trap and it costs XP
                      at 2x and breaks the streak.
"""
from datetime import date, datetime
from sqlalchemy import String, Integer, Text, Date, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.ext.mutable import MutableDict
from database import Base

# JSON column that tracks in-place mutations (dict[key]=val) so SQLAlchemy
# actually persists them on commit.
MutJSON = MutableDict.as_mutable(JSON)


def _utcnow_iso() -> str:
    return datetime.utcnow().isoformat()


class User(Base):
    """A local profile keyed to a Supabase identity.

    Credentials (password, OAuth, reset, MFA) live in Supabase — this row is
    just the app-side anchor that project data hangs off of, plus entitlement
    fields the billing epic (KAN-3) will drive. `supabase_user_id` is the JWT
    `sub`; it's nullable only so the pre-auth "Local Owner" placeholder created
    when migrating an existing single-user DB can be adopted on first sign-in.
    """
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    supabase_user_id: Mapped[str | None] = mapped_column(String, unique=True, index=True, nullable=True)
    email: Mapped[str | None] = mapped_column(String, nullable=True)  # synced from the verified token
    display_name: Mapped[str] = mapped_column(String, default="")
    created_at: Mapped[str] = mapped_column(String, default=_utcnow_iso)

    # entitlement foundation — data only this increment; KAN-3 (Stripe/IAP) drives it.
    plan: Mapped[str] = mapped_column(String, default="free")            # free | pro
    plan_status: Mapped[str] = mapped_column(String, default="active")   # active|trialing|past_due|canceled
    plan_source: Mapped[str | None] = mapped_column(String, nullable=True)  # stripe | app_store | null
    plan_expires_at: Mapped[str | None] = mapped_column(String, nullable=True)

    projects: Mapped[list["Project"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class Project(Base):
    __tablename__ = "projects"
    id: Mapped[int] = mapped_column(primary_key=True)
    # Owner. Nullable at the column level so ensure_schema() can add it to
    # existing DBs (which it then backfills via ensure_default_owner); the app
    # layer treats every project as owned once auth is in front of the routes.
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String, default="Untitled Project")
    subtitle: Mapped[str] = mapped_column(String, default="Novel")

    author: Mapped[str] = mapped_column(String, default="")
    target: Mapped[int] = mapped_column(Integer, default=80000)
    deadline: Mapped[date] = mapped_column(Date)
    start_date: Mapped[date] = mapped_column(Date, default=date.today)
    days_per_week: Mapped[int] = mapped_column(Integer, default=5)

    # gamification / accounting
    xp: Mapped[int] = mapped_column(Integer, default=0)
    lifetime_words: Mapped[int] = mapped_column(Integer, default=0)
    streak: Mapped[int] = mapped_column(Integer, default=0)
    last_met_day: Mapped[str | None] = mapped_column(String, nullable=True)

    baseline_date: Mapped[str | None] = mapped_column(String, nullable=True)
    baseline_words: Mapped[int] = mapped_column(Integer, default=0)
    cut_debt: Mapped[int] = mapped_column(Integer, default=0)

    badges: Mapped[dict] = mapped_column(MutJSON, default=dict)
    milestones_done: Mapped[dict] = mapped_column(MutJSON, default=dict)
    daily_log: Mapped[dict] = mapped_column(MutJSON, default=dict)  # "YYYY-MM-DD" -> net words
    dictionary: Mapped[dict] = mapped_column(MutJSON, default=dict)  # custom spelling words {word: True}

    user: Mapped["User"] = relationship(back_populates="projects")
    sheets: Mapped[list["Sheet"]] = relationship(
        back_populates="project", cascade="all, delete-orphan", order_by="Sheet.position"
    )
    cuts: Mapped[list["Cut"]] = relationship(
        back_populates="project", cascade="all, delete-orphan", order_by="Cut.id.desc()"
    )
    tasks: Mapped[list["Task"]] = relationship(
        back_populates="project", cascade="all, delete-orphan", order_by="Task.position"
    )


class Sheet(Base):
    __tablename__ = "sheets"
    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"))
    title: Mapped[str] = mapped_column(String, default="Untitled")
    text: Mapped[str] = mapped_column(Text, default="")   # stored as HTML
    words: Mapped[int] = mapped_column(Integer, default=0)
    position: Mapped[int] = mapped_column(Integer, default=0)
    include_in_manuscript: Mapped[bool] = mapped_column(default=True)
    project: Mapped["Project"] = relationship(back_populates="sheets")


class Cut(Base):
    """Stashed text — the non-destructive outlet for 'this is terrible'."""
    __tablename__ = "cuts"
    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"))
    sheet_title: Mapped[str] = mapped_column(String, default="")
    text: Mapped[str] = mapped_column(Text, default="")
    words: Mapped[int] = mapped_column(Integer, default=0)
    created: Mapped[str] = mapped_column(String, default="")
    project: Mapped["Project"] = relationship(back_populates="cuts")


class Task(Base):
    """A small, checkable step — the 'break the elephant into boxes' loop."""
    __tablename__ = "tasks"
    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"))
    text: Mapped[str] = mapped_column(String, default="")
    done: Mapped[bool] = mapped_column(default=False)
    position: Mapped[int] = mapped_column(Integer, default=0)
    created: Mapped[str] = mapped_column(String, default="")
    project: Mapped["Project"] = relationship(back_populates="tasks")


class AppState(Base):
    """Single-row table for cross-window app state (shared by the main window
    and the desktop widget) — e.g. which project is currently active."""
    __tablename__ = "app_state"
    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    active_project_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
