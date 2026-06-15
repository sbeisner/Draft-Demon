"""Data model.

Key idea behind the anti-deletion design:

* `lifetime_words`  — gross words ever ADDED to the manuscript. Never goes down.
                      Drives XP earned. Writing is always rewarded.
* `baseline_words`  — the manuscript's total word count at the START of today.
                      Everything at/below this line is "committed" past work.
* daily progress    — counts only NET NEW words above today's baseline. Deleting
                      words you wrote *today* just lowers today's number toward 0
                      (no penalty — that's normal editing).
* cut_debt          — how far the manuscript currently sits BELOW today's baseline,
                      i.e. how much committed past work you've clawed back. Digging
                      deeper here is the "delete everything" trap and it costs XP
                      and breaks the streak.
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

    sheets: Mapped[list["Sheet"]] = relationship(
        back_populates="project", cascade="all, delete-orphan", order_by="Sheet.position"
    )
    cuts: Mapped[list["Cut"]] = relationship(
        back_populates="project", cascade="all, delete-orphan", order_by="Cut.id.desc()"
    )


class Sheet(Base):
    __tablename__ = "sheets"
    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"))
    title: Mapped[str] = mapped_column(String, default="Untitled")
    text: Mapped[str] = mapped_column(Text, default="")
    words: Mapped[int] = mapped_column(Integer, default=0)
    position: Mapped[int] = mapped_column(Integer, default=0)
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
