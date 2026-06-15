"""SQLite + SQLAlchemy setup. The DB file lives next to this module so it
travels with the app and is easy to find / back up / delete during dev."""
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

DB_PATH = os.environ.get("DRAFTDEMON_DB", os.path.join(os.path.dirname(__file__), "draftdemon.db"))
engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
