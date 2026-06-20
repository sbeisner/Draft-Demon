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
from datetime import date
from sqlalchemy import String, Integer, Text, Date, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.ext.mutable import MutableDict
from database import Base

# JSON column that tracks in-place mutations (dict[key]=val) so SQLAlchemy
# actually persists them on commit.
MutJSON = MutableDict.as_mutable(JSON)


class Project(Base):
    __tablename__ = "projects"
    id: Mapped[int] = mapped_column(primary_key=True)
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
