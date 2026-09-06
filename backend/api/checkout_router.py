"""Rotas de checkout mock (TCC) — sem SDK de loja."""
from fastapi import APIRouter, Depends, Request
from loguru import logger

from core.auth_middleware import CurrentUser, get_current_user
from core.rate_limit import limiter
from models.auth import SyncResponse
from services import checkout_service

router = APIRouter(prefix="/checkout", tags=["checkout"])

_RATE_LIMIT = "5/minute"


@router.post("/upgrade", response_model=SyncResponse)
@limiter.limit(_RATE_LIMIT)
async def upgrade(
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
) -> SyncResponse:
    """Simula pagamento ok e devolve o perfil atualizado."""
    logger.info("Checkout upgrade solicitado: uid={}", current_user.uid)
    return await checkout_service.upgrade(current_user.uid)


@router.post("/cancel", response_model=SyncResponse)
@limiter.limit(_RATE_LIMIT)
async def cancel(
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
) -> SyncResponse:
    """Cancela a simulação Pro. Não apaga roteiros."""
    logger.info("Checkout cancel solicitado: uid={}", current_user.uid)
    return await checkout_service.cancel(current_user.uid)
