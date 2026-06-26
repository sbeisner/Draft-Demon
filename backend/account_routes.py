"""Account profile + deletion endpoints (Jira KAN-17, KAN-18).

Sign-up / sign-in / password / email changes are NOT here — those happen
directly between the client and Supabase (`supabase.auth.*`). This router only
covers the app-side profile and the local half of account deletion.
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

import models
from database import get_db
from deps import get_current_user

router = APIRouter(prefix="/api/account", tags=["account"])


def serialize_user(u: models.User) -> dict:
    return {
        "id": u.id,
        "email": u.email,
        "display_name": u.display_name,
        "plan": u.plan,
        "plan_status": u.plan_status,
        "plan_source": u.plan_source,
        "plan_expires_at": u.plan_expires_at,
    }


class ProfilePatch(BaseModel):
    display_name: str | None = None


@router.get("/me")
def get_me(user: models.User = Depends(get_current_user)):
    return serialize_user(user)


@router.patch("/me")
def update_me(
    body: ProfilePatch,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if body.display_name is not None:
        user.display_name = body.display_name.strip()
        db.commit()
        db.refresh(user)
    return serialize_user(user)


@router.delete("/me")
def delete_me(
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Remove all of the user's local data and profile row. Projects (and their
    sheets/cuts/tasks via the existing cascades) go with the User. The Supabase
    identity itself is deleted client-side through the `delete-account` Edge
    Function — the service_role key that requires must never ship in this
    locally-run backend."""
    # Drop the shared active-project pointer if it referenced this user's work.
    state = db.get(models.AppState, 1)
    if state and state.active_project_id is not None:
        proj = db.get(models.Project, state.active_project_id)
        if proj is None or proj.user_id == user.id:
            state.active_project_id = None
    db.delete(user)
    db.commit()
    return {"ok": True}
