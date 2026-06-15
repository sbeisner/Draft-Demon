"""Create a demo project so the app isn't empty on first run.
Run once:  python seed.py"""
from datetime import date, timedelta
from database import Base, engine, SessionLocal
import models

Base.metadata.create_all(bind=engine)
db = SessionLocal()

if db.query(models.Project).count() == 0:
    p = models.Project(
        title="The Salt Road", subtitle="Novel",
        target=200000, deadline=date.today() + timedelta(days=365),
        start_date=date.today(), days_per_week=5,
        badges={}, milestones_done={}, daily_log={},
    )
    p.sheets.append(models.Sheet(title="Chapter 1 — The Tide Line", text="", words=0, position=0))
    p.sheets.append(models.Sheet(title="Chapter 2 — Harbor Lights", text="", words=0, position=1))
    db.add(p)
    db.commit()
    print("Seeded demo project:", p.title)
else:
    print("Projects already exist — skipping seed.")
db.close()
