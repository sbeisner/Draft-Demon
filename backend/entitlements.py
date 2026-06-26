"""Subscription entitlement checks.

Foundation only this increment: the `plan*` fields on `User` exist and these
helpers read them, but no feature is gated yet. The Payments epic (KAN-3) will
populate the fields from Stripe/Apple IAP webhooks and call `require_pro` at the
points that should be paywalled. Keeping the read logic in one place means that
wiring is a localized change later.
"""
import models

PRO_PLANS = {"pro"}
ACTIVE_STATUSES = {"active", "trialing"}


def has_pro(user: models.User) -> bool:
    """True when the user currently holds an active paid entitlement."""
    return user.plan in PRO_PLANS and user.plan_status in ACTIVE_STATUSES


def require_pro(user: models.User) -> None:
    """Raise 402 Payment Required if the user lacks an active paid plan.
    Not wired to any route yet — KAN-3 will call this at paywalled features."""
    from fastapi import HTTPException
    if not has_pro(user):
        raise HTTPException(402, "This feature requires an active subscription")
