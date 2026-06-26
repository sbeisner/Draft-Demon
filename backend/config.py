"""Auth configuration — Supabase identity verification.

Identity (sign-up, login, OAuth, password reset, MFA) is owned by Supabase.
This backend only *verifies* the JWTs Supabase issues, against the project's
public JWKS — so the only thing it needs is the project URL, which is public,
not a secret. Everything derives from `SUPABASE_URL`, passed in by the Electron
main process (or the dev shell) as an environment variable.

Supabase access tokens are signed with the project's asymmetric keys (ES256 /
RS256) once "JWT signing keys" are enabled in the dashboard; verification uses
the public keys at the JWKS endpoint and holds no secret on any client. (Legacy
HS256 projects are intentionally not supported — that mode shares a symmetric
secret, which we will not ship to a locally-run backend.)
"""
import os


def _load_dotenv():
    """Load backend/.env into the environment (without overriding real env
    vars), so `npm run dev` — which launches uvicorn directly — picks up
    SUPABASE_URL without a separate export step. Dependency-free KEY=VALUE
    parser; the packaged app sets these via the Electron process instead."""
    path = os.path.join(os.path.dirname(__file__), ".env")
    try:
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    except FileNotFoundError:
        pass


_load_dotenv()

# e.g. https://abcdefgh.supabase.co  — public, safe to ship.
SUPABASE_URL = (os.environ.get("SUPABASE_URL") or "").rstrip("/")
# Public anon key; kept here for reference / health reporting (not used to verify).
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")

# Supabase GoTrue mounts auth under /auth/v1; tokens carry iss=<url>/auth/v1
# and aud="authenticated".
AUTH_BASE = f"{SUPABASE_URL}/auth/v1" if SUPABASE_URL else ""
JWKS_URL = f"{AUTH_BASE}/.well-known/jwks.json" if AUTH_BASE else ""
JWT_ISSUER = AUTH_BASE
JWT_AUDIENCE = "authenticated"
JWT_ALGORITHMS = ["ES256", "RS256"]


def is_configured() -> bool:
    """True once SUPABASE_URL is set, so the backend can verify tokens."""
    return bool(SUPABASE_URL)
