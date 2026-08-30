"""Rotas de sessão do Match de Viajantes (RF11/RF12)."""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Request, status
from fastapi.responses import StreamingResponse
from loguru import logger

from core.auth_middleware import CurrentUser, get_current_user
from core.rate_limit import limiter
from core.sse import itinerary_sse_stream
from models.match import (
    CreateMatchRequest,
    JoinMatchRequest,
    MatchInDB,
    MatchInviteSummary,
    MatchPendingSummary,
)
from services import match_service

router = APIRouter(prefix="/matches", tags=["matches"])

# Limita criação abusiva de documentos e tentativas automatizadas de ingresso.
_RATE_LIMIT = "10/minute"
# Geração consome API paga e segue o mesmo limite do roteiro Solo.
_GENERATION_RATE_LIMIT = "5/minute"
MatchId = Annotated[
    str,
    Path(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9_-]+$"),
]


@router.post("", response_model=MatchInDB, status_code=status.HTTP_201_CREATED)
@limiter.limit(_RATE_LIMIT)
async def create_match(
    request: Request,  # exigido pelo slowapi para identificar o IP
    body: CreateMatchRequest,
    current_user: CurrentUser = Depends(get_current_user),
) -> MatchInDB:
    """Cria uma sessão `waiting` com o usuário autenticado como proprietário."""
    logger.info("Criação de Match solicitada: owner_uid={}", current_user.uid)
    return await match_service.create_match(current_user.uid, body)


# Rota estática ANTES de /{match_id} — senão "pending" vira path param.
@router.get("/pending", response_model=list[MatchPendingSummary])
@limiter.limit(_RATE_LIMIT)
async def list_pending_matches(
    request: Request,  # exigido pelo slowapi para identificar o IP
    current_user: CurrentUser = Depends(get_current_user),
) -> list[MatchPendingSummary]:
    """Lobbies waiting do dono autenticado — banner da Home."""
    return await match_service.list_pending_matches(current_user.uid)


@router.get("/{match_id}", response_model=MatchInDB | MatchInviteSummary)
@limiter.limit(_RATE_LIMIT)
async def get_match(
    request: Request,  # exigido pelo slowapi para identificar o IP
    match_id: MatchId,
    current_user: CurrentUser = Depends(get_current_user),
) -> MatchInDB | MatchInviteSummary:
    """Retorna o resumo do convite ou a sessão completa para participantes."""
    return await match_service.get_match_for_viewer(match_id, current_user.uid)


@router.post("/{match_id}/join", response_model=MatchInDB)
@limiter.limit(_RATE_LIMIT)
async def join_match(
    request: Request,  # exigido pelo slowapi para identificar o IP
    match_id: MatchId,
    current_user: CurrentUser = Depends(get_current_user),
    body: JoinMatchRequest | None = None,
) -> MatchInDB:
    """Aceita o convite e fecha a sessão com dois participantes."""
    logger.info(
        "Entrada em Match solicitada: match_id={} participant_uid={}",
        match_id,
        current_user.uid,
    )
    notes = body.notes if body is not None else ""
    return await match_service.join_match(match_id, current_user.uid, notes)


@router.post("/{match_id}/generate")
@limiter.limit(_GENERATION_RATE_LIMIT)
async def generate_match(
    request: Request,  # exigido pelo slowapi para identificar o IP
    match_id: MatchId,
    current_user: CurrentUser = Depends(get_current_user),
) -> StreamingResponse:
    """Gera o roteiro conciliado dos dois participantes via SSE."""
    logger.info(
        "Geração de Match solicitada: match_id={} requester_uid={}",
        match_id,
        current_user.uid,
    )
    try:
        token_stream = await match_service.generate_match_itinerary_stream(
            match_id,
            current_user.uid,
        )
    except HTTPException:
        raise
    except RuntimeError as exc:
        logger.error("Provedor LLM indisponível para Match: {}", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Serviço de geração temporariamente indisponível.",
        ) from exc

    return StreamingResponse(
        itinerary_sse_stream(token_stream, f"match_id={match_id}"),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
