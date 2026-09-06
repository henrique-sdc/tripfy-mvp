"""
Checkout mock do TCC — simula assinatura Tripfy Pro sem StoreKit/Play.

Troca futura: este service vira adapter de IAP; entitlement_service não muda.
"""
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from loguru import logger

from core.config import settings
from models.auth import SyncResponse
from models.user import SubscriptionTier
from repositories import user_repository
from services.auth_service import sync_response_from_user

MOCK_PREMIUM_DAYS = 365


def _require_mock_enabled() -> None:
    if not settings.CHECKOUT_MOCK_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Checkout mock desligado neste ambiente.",
        )


async def _require_user(uid: str):
    user = await user_repository.get_user(uid)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuário não encontrado. Faça sync em /auth/sync primeiro.",
        )
    return user


async def upgrade(uid: str) -> SyncResponse:
    """Marca Pro por 365 dias. Idempotente: renova a data."""
    _require_mock_enabled()
    await _require_user(uid)
    until = datetime.now(timezone.utc) + timedelta(days=MOCK_PREMIUM_DAYS)
    user = await user_repository.update_subscription(
        uid,
        SubscriptionTier.PRO,
        until,
    )
    logger.info("Checkout mock upgrade: uid={} premium_until={}", uid, until)
    return sync_response_from_user(user)


async def cancel(uid: str) -> SyncResponse:
    """Volta pra Free. Viagens já salvas ficam."""
    _require_mock_enabled()
    await _require_user(uid)
    user = await user_repository.update_subscription(
        uid,
        SubscriptionTier.FREE,
        None,
    )
    logger.info("Checkout mock cancel: uid={}", uid)
    return sync_response_from_user(user)
