"""
Entitlement Tripfy Pro — fonte da verdade no backend (Seção 6.2).

Geração por IA nunca é paywall. O teto Free vale só ao *adicionar*
uma viagem ativa (create / clone / restore).
"""
from datetime import datetime, timezone

from fastapi import HTTPException, status

from models.user import SubscriptionTier, UserInDB
from repositories import trips_repository, user_repository

FREE_ACTIVE_TRIP_LIMIT = 2
PREMIUM_REQUIRED_CODE = "premium_required"


def is_premium_effective(
    user: UserInDB,
    now: datetime | None = None,
) -> bool:
    """Pro vitalício (until None) ou until no futuro. Expirado = Free."""
    if user.tier != SubscriptionTier.PRO:
        return False
    if user.premium_until is None:
        return True
    moment = now or datetime.now(timezone.utc)
    until = user.premium_until
    if until.tzinfo is None:
        until = until.replace(tzinfo=timezone.utc)
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return until > moment


def premium_required_detail(*, current: int) -> dict[str, object]:
    return {
        "code": PREMIUM_REQUIRED_CODE,
        "reason": "active_trip_limit",
        "limit": FREE_ACTIVE_TRIP_LIMIT,
        "current": current,
    }


async def assert_can_add_active_trip(uid: str) -> None:
    """402 se Free já tem o teto de viagens ativas."""
    user = await user_repository.get_user(uid)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuário não encontrado. Faça sync em /auth/sync primeiro.",
        )
    if is_premium_effective(user):
        return

    current = await trips_repository.count_active(uid)
    if current >= FREE_ACTIVE_TRIP_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=premium_required_detail(current=current),
        )
