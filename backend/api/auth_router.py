"""
Rotas de autenticação (RF01 + Seção 3.3).

Todas exigem ID Token válido (get_current_user) e têm rate limiting de
10 req/min por IP (Seção 6.2). O backend nunca recebe senha.
"""
from fastapi import APIRouter, Depends, Request, status
from loguru import logger

from core.auth_middleware import CurrentUser, get_current_user
from core.rate_limit import limiter
from models.auth import SavePreferencesRequest, SyncResponse
from services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])

# Limite aplicado às rotas sensíveis desta sessão.
_RATE_LIMIT = "10/minute"


@router.post("/sync", response_model=SyncResponse)
@limiter.limit(_RATE_LIMIT)
async def sync_user(
    request: Request,  # exigido pelo slowapi para identificar o IP
    current_user: CurrentUser = Depends(get_current_user),
) -> SyncResponse:
    """
    Sincroniza o usuário autenticado com o Firestore.

    Chamado pelo app no primeiro login de cada sessão. Cria o documento se for
    a primeira vez e retorna se o onboarding de preferências já foi concluído.
    """
    logger.info("Sync de usuário solicitado: uid={}", current_user.uid)
    return await auth_service.sync_user(current_user.uid, current_user.email)


@router.put("/preferences", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit(_RATE_LIMIT)
async def save_preferences(
    request: Request,  # exigido pelo slowapi para identificar o IP
    body: SavePreferencesRequest,
    current_user: CurrentUser = Depends(get_current_user),
) -> None:
    """Salva as preferências de viagem coletadas na tela de onboarding."""
    logger.info("Salvando preferências: uid={}", current_user.uid)
    await auth_service.save_user_preferences(current_user.uid, body.preferences)
