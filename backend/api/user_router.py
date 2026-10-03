"""Rotas de perfil público e rede de companheiros."""
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Request, Response, status
from loguru import logger

from core.auth_middleware import CurrentUser, get_current_user
from core.rate_limit import limiter
from models.user import BindVibePickRequest, UserPublicProfile, VibePickOpenResponse, VibePicksResponse
from services import user_service, vibe_picks

router = APIRouter(prefix="/users", tags=["users"])

# Leitura pública: um pouco mais folgado que mutações, ainda anti-scraping.
_PUBLIC_RATE_LIMIT = "30/minute"
_COMPANION_RATE_LIMIT = "20/minute"
_VIBE_PICKS_LIMIT = "20/minute"
_VIBE_OPEN_LIMIT = "30/minute"

FirebaseUid = Annotated[
    str,
    Path(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9_-]+$"),
]


# Rotas estáticas `/me/...` antes de `/{uid}/...` — evita ambiguidade de path.
@router.get("/me/companions", response_model=list[UserPublicProfile])
@limiter.limit(_PUBLIC_RATE_LIMIT)
async def list_my_companions(
    request: Request,  # exigido pelo slowapi para identificar o IP
    current_user: CurrentUser = Depends(get_current_user),
) -> list[UserPublicProfile]:
    """Lista hidratada (nome/foto/vibe) dos companheiros do usuário logado."""
    logger.info("Lista de companheiros solicitada: uid={}", current_user.uid)
    return await user_service.list_my_companions(current_user.uid)


@router.post(
    "/me/companions/{uid}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
@limiter.limit(_COMPANION_RATE_LIMIT)
async def add_companion(
    request: Request,  # exigido pelo slowapi para identificar o IP
    uid: FirebaseUid,
    current_user: CurrentUser = Depends(get_current_user),
) -> Response:
    """Adiciona o alvo à lista unilateral de companheiros do usuário logado."""
    logger.info(
        "Adição de companheiro solicitada: my_uid={} target_uid={}",
        current_user.uid,
        uid,
    )
    await user_service.add_companion(current_user.uid, uid)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete(
    "/me/companions/{uid}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
@limiter.limit(_COMPANION_RATE_LIMIT)
async def remove_companion(
    request: Request,  # exigido pelo slowapi para identificar o IP
    uid: FirebaseUid,
    current_user: CurrentUser = Depends(get_current_user),
) -> Response:
    """Remove o alvo da lista unilateral de companheiros do usuário logado."""
    logger.info(
        "Remoção de companheiro solicitada: my_uid={} target_uid={}",
        current_user.uid,
        uid,
    )
    await user_service.remove_companion(current_user.uid, uid)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/me/vibe-picks", response_model=VibePicksResponse)
@limiter.limit(_VIBE_PICKS_LIMIT)
async def refresh_vibe_picks(
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
) -> VibePicksResponse:
    """Três cidades da vibe. Sem LLM se as preferências não mudaram."""
    return await vibe_picks.ensure_vibe_picks(current_user.uid)


@router.post("/me/vibe-picks/{index}/open", response_model=VibePickOpenResponse)
@limiter.limit(_VIBE_OPEN_LIMIT)
async def open_vibe_pick(
    request: Request,
    index: int = Path(..., ge=0, le=2),
    current_user: CurrentUser = Depends(get_current_user),
) -> VibePickOpenResponse:
    """Abre a viagem salva ou libera a geração se ainda couber no teto."""
    return await vibe_picks.open_vibe_pick(current_user.uid, index)


@router.post("/me/vibe-picks/{index}/trip", response_model=VibePicksResponse)
@limiter.limit(_VIBE_OPEN_LIMIT)
async def bind_vibe_pick_trip(
    request: Request,
    body: BindVibePickRequest,
    index: int = Path(..., ge=0, le=2),
    current_user: CurrentUser = Depends(get_current_user),
) -> VibePicksResponse:
    """Liga o card ao roteiro recém-salvo. O próximo toque não gera de novo."""
    return await vibe_picks.attach_vibe_pick_trip(
        current_user.uid,
        index,
        body.trip_id,
    )


@router.get("/{uid}/public", response_model=UserPublicProfile)
@limiter.limit(_PUBLIC_RATE_LIMIT)
async def get_public_profile(
    request: Request,  # exigido pelo slowapi para identificar o IP
    uid: FirebaseUid,
    current_user: CurrentUser = Depends(get_current_user),
) -> UserPublicProfile:
    """Proxy autenticado do perfil — nunca devolve email ou dados sensíveis."""
    logger.info(
        "Perfil público solicitado: viewer_uid={} target_uid={}",
        current_user.uid,
        uid,
    )
    return await user_service.get_public_profile(uid)
