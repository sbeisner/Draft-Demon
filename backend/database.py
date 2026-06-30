"""SQLite + SQLAlchemy setup. The DB file lives next to this module so it
travels with the app and is easy to find / back up / delete during dev."""
import os
from datetime import datetime
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase

DB_PATH = os.environ.get("DRAFTDEMON_DB", os.path.join(os.path.dirname(__file__), "draftdemon.db"))
# The packaged app points DRAFTDEMON_DB at ~/Library/Application Support/Inkubus,
# which doesn't exist on a fresh install — SQLite won't create missing parent
# dirs and would crash the backend on first launch ("unable to open database
# file"). Create the directory ourselves so the very first run works.
_db_dir = os.path.dirname(os.path.abspath(DB_PATH))
if _db_dir:
    os.makedirs(_db_dir, exist_ok=True)
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


def _literal_default(col):
    """Render a column's client-side scalar default as a SQL literal for
    ALTER TABLE, so existing rows get a sensible value. Returns None for
    callable/server defaults (the added column stays nullable; the ORM's
    Python default fills it on future inserts)."""
    d = col.default
    if d is None or not getattr(d, "is_scalar", False):
        return None
    arg = d.arg
    if isinstance(arg, bool):
        return "1" if arg else "0"
    if isinstance(arg, (int, float)):
        return str(arg)
    return "'" + str(arg).replace("'", "''") + "'"


def ensure_schema():
    """Add any model columns that are missing from existing tables.

    `Base.metadata.create_all()` creates new *tables* but never alters existing
    ones, so adding a field to a model leaves older databases missing the
    column — and every query then fails with `no such column`. This bridges
    that gap with additive `ALTER TABLE ... ADD COLUMN` (SQLite-safe, never
    drops or rewrites data). Call it once at startup, after create_all."""
    insp = inspect(engine)
    tables = set(insp.get_table_names())
    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            if table.name not in tables:
                continue  # brand-new table — create_all already handled it
            have = {c["name"] for c in insp.get_columns(table.name)}
            for col in table.columns:
                if col.name in have:
                    continue
                coltype = col.type.compile(dialect=engine.dialect)
                ddl = f"ALTER TABLE {table.name} ADD COLUMN {col.name} {coltype}"
                default = _literal_default(col)
                if default is not None:
                    ddl += f" DEFAULT {default}"
                conn.execute(text(ddl))


def ensure_default_owner():
    """Backfill ownership when an existing single-user DB gains accounts.

    `ensure_schema()` adds `projects.user_id` as a *nullable* column (the
    additive ALTER can't enforce NOT NULL or pick an owner), so pre-existing
    projects start with `user_id IS NULL` and would be invisible once routes
    require an authenticated owner. This seeds one password-less placeholder
    user ("Local Owner") and assigns it every orphaned project. The placeholder
    has no `supabase_user_id`; the first real sign-in *adopts* it (see deps.py)
    so the existing work lands under that account. Idempotent and a no-op once
    any user exists. Run once at startup, after ensure_schema()."""
    with engine.begin() as conn:
        existing = conn.execute(text("SELECT id FROM users LIMIT 1")).first()
        if existing is None:
            owner_id = conn.execute(
                text("INSERT INTO users (display_name, plan, plan_status, created_at) "
                     "VALUES ('Local Owner', 'free', 'active', :ts)"),
                {"ts": datetime.utcnow().isoformat()},
            ).lastrowid
        else:
            owner_id = existing[0]
        conn.execute(
            text("UPDATE projects SET user_id = :oid WHERE user_id IS NULL"),
            {"oid": owner_id},
        )
