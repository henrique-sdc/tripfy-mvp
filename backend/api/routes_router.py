"""
Rotas de deslocamento (RF06.1).

Chave Google só no servidor. O corpo vai em POST pra não cair em log de acesso.
"""
from fastapi import APIRouter, Depends, Request
from loguru import logger

from core.auth_middleware import CurrentUser, get_current_user
from core.rate_limit import limiter
from models.routes import CalculateRoutesRequest, CalculateRoutesResponse
from services import routes_service

router = APIRouter(prefix="/routes", tags=["routes"])

_CALCULATE_LIMIT = "20/minute"


@router.post("/calculate", response_model=CalculateRoutesResponse)
@limiter.limit(_CALCULATE_LIMIT)
async def calculate_routes(
    request: Request,
    body: CalculateRoutesRequest,
    current_user: CurrentUser = Depends(get_current_user),
) -> CalculateRoutesResponse:
    """Tempo e distância entre paradas consecutivas do dia visível."""
    logger.info(
        "Routes calculate: uid={} stops={} mode={}",
        current_user.uid,
        len(body.stops),
        body.travel_mode.value,
    )
    result = await routes_service.calculate_routes(body)
    logger.info(
        "Routes calculate ok: uid={} legs={}",
        current_user.uid,
        len(result.legs),
    )
    return result
