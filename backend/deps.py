"""FastAPI dependencies for authentication and per-user data scoping.

`get_current_user` verifies the Supabase access token on the request, then maps
it to a local `User` row (creating one the first time we see an identity — JIT
provisioning). `get_owned_project` replaces the old unscoped `get_project` so a
handler can only ever touch projects the caller owns.
"""
import jwt
from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

import config
import models
from database import get_db

# PyJWKClient fetches and caches the project's public signing keys from the
# JWKS endpoint, refreshing on rotation. Built lazily because SUPABASE_URL is
# read from the environment at process start.
_jwk_client: jwt.PyJWKClient | None = None


def _jwks() -> jwt.PyJWKClient:
    global _jwk_client
    if _jwk_client is None:
        _jwk_client = jwt.PyJWKClient(config.JWKS_URL)
    return _jwk_client


def _verify_token(token: str) -> dict:
    """Verify a Supabase JWT against the project JWKS; return its claims."""
    try:
        signing_key = _jwks().get_signing_key_from_jwt(token).key
        return jwt.decode(
            token,
            signing_key,
            algorithms=config.JWT_ALGORITHMS,
            audience=config.JWT_AUDIENCE,
            issuer=config.JWT_ISSUER,
        )
    except jwt.PyJWTError as e:
        raise HTTPException(401, f"Invalid token: {e}")
    except Exception as e:  # JWKS fetch/network failure
        raise HTTPException(503, f"Could not verify token: {e}")


def get_current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> models.User:
    if not config.is_configured():
        raise HTTPException(503, "Authentication is not configured (SUPABASE_URL unset)")
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Missing bearer token")

    claims = _verify_token(authorization.split(" ", 1)[1].strip())
    sub = claims.get("sub")
    if not sub:
        raise HTTPException(401, "Token missing subject")
    email = claims.get("email")

    user = db.query(models.User).filter_by(supabase_user_id=sub).first()
    if user is not None:
        if email and user.email != email:  # keep the local copy fresh
            user.email = email
            db.commit()
        return user

    # First time we've seen this identity. If an unclaimed "Local Owner"
    # placeholder exists (an existing single-user DB that just gained accounts),
    # adopt it so the pre-existing projects stay with this account. Otherwise
    # provision a fresh user.
    placeholder = db.query(models.User).filter_by(supabase_user_id=None).first()
    if placeholder is not None:
        placeholder.supabase_user_id = sub
        placeholder.email = email
        if not placeholder.display_name or placeholder.display_name == "Local Owner":
            placeholder.display_name = (email or "").split("@")[0] or "Writer"
        db.commit()
        return placeholder

    user = models.User(
        supabase_user_id=sub,
        email=email,
        display_name=(email or "").split("@")[0] or "Writer",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def get_owned_project(db: Session, pid: int, user: models.User) -> models.Project:
    """Load a project the caller owns, or 404. Returns 404 (not 403) for
    someone else's project so we don't leak that the id exists."""
    p = db.get(models.Project, pid)
    if p is None or p.user_id != user.id:
        raise HTTPException(404, "Project not found")
    return p
