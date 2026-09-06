"""
Rotas de viagem — geração SSE (RF06) + CRUD soft-delete/clone (RF07/RF09).
"""
from fastapi import APIRouter, Depends, HTTPException, Path, Request, status
from fastapi.responses import StreamingResponse
from loguru import logger

from core.auth_middleware import CurrentUser, get_current_user
from core.rate_limit import limiter
from core.sse import itinerary_sse_stream
from models.trip import (
    CloneTripResponse,
    CreateTripRequest,
    GenerateTripRequest,
    SavedTripResponse,
)
from repositories import trips_repository
from services import trip_service

router = APIRouter(prefix="/trips", tags=["trips"])

_GENERATE_LIMIT = "5/minute"
_CRUD_LIMIT = "30/minute"
_CLONE_LIMIT = "10/minute"


@router.get("", response_model=list[SavedTripResponse])
@limiter.limit(_CRUD_LIMIT)
async def list_trips(
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
) -> list[SavedTripResponse]:
    """Lista viagens ativas do usuário (deleted_at == null)."""
    logger.info("Listando trips: uid={}", current_user.uid)
    return await trips_repository.list_active(current_user.uid)


@router.post("", response_model=SavedTripResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit(_CRUD_LIMIT)
async def create_trip(
    request: Request,
    body: CreateTripRequest,
    current_user: CurrentUser = Depends(get_current_user),
) -> SavedTripResponse:
    """Cria viagem ativa. Free estoura o teto → 402 premium_required."""
    logger.info("Criando trip: uid={} destino={}", current_user.uid, body.destination)
    return await trip_service.create_saved_trip(current_user.uid, body)


@router.get("/trash", response_model=list[SavedTripResponse])
@limiter.limit(_CRUD_LIMIT)
async def list_trash(
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
) -> list[SavedTripResponse]:
    """Lixeira — soft-deleted há ≤30 dias."""
    logger.info("Listando lixeira: uid={}", current_user.uid)
    return await trips_repository.list_trash(current_user.uid)


@router.get("/{trip_id}", response_model=SavedTripResponse)
@limiter.limit(_CRUD_LIMIT)
async def get_trip(
    request: Request,
    trip_id: str = Path(..., min_length=8, max_length=128),
    current_user: CurrentUser = Depends(get_current_user),
) -> SavedTripResponse:
    """Detalhe — dono ou visitante (deep link). Visitante = read_only."""
    trip = await trips_repository.get_trip(trip_id, current_user.uid)
    if trip is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Viagem não encontrada.",
        )
    logger.info(
        "Trip get: uid={} trip_id={} is_owner={}",
        current_user.uid,
        trip_id,
        trip.is_owner,
    )
    return trip


@router.delete("/{trip_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit(_CRUD_LIMIT)
async def soft_delete_trip(
    request: Request,
    trip_id: str = Path(..., min_length=8, max_length=128),
    current_user: CurrentUser = Depends(get_current_user),
) -> None:
    """Soft delete — vai pra lixeira por 30 dias."""
    ok = await trips_repository.soft_delete(current_user.uid, trip_id)
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Viagem não encontrada.",
        )


@router.post("/{trip_id}/restore", response_model=SavedTripResponse)
@limiter.limit(_CRUD_LIMIT)
async def restore_trip(
    request: Request,
    trip_id: str = Path(..., min_length=8, max_length=128),
    current_user: CurrentUser = Depends(get_current_user),
) -> SavedTripResponse:
    """Tira da lixeira (se ainda dentro dos 30 dias). Free no teto → 402."""
    return await trip_service.restore_saved_trip(trip_id, current_user.uid)


@router.post("/{trip_id}/clone", response_model=CloneTripResponse)
@limiter.limit(_CLONE_LIMIT)
async def clone_trip(
    request: Request,
    trip_id: str = Path(..., min_length=8, max_length=128),
    current_user: CurrentUser = Depends(get_current_user),
) -> CloneTripResponse:
    """Clona roteiro ativo pra conta do usuário autenticado. Free no teto → 402."""
    return await trip_service.clone_saved_trip(trip_id, current_user.uid)


@router.post("/generate")
@limiter.limit(_GENERATE_LIMIT)
async def generate_trip(
    request: Request,  # exigido pelo slowapi para identificar o IP
    body: GenerateTripRequest,
    current_user: CurrentUser = Depends(get_current_user),
) -> StreamingResponse:
    """
    Gera roteiro personalizado com streaming SSE.

    Body: destination, days, budget, notes.
    Preferências de perfil vêm do Firestore (não do frontend).
    """
    logger.info(
        "Geração de roteiro solicitada: uid={} destino={} dias={}",
        current_user.uid,
        body.destination,
        body.days,
    )

    try:
        token_stream = await trip_service.generate_itinerary_stream(
            current_user.uid,
            body,
        )
    except HTTPException:
        raise
    except RuntimeError as exc:
        # Tipicamente OPENAI_API_KEY / GEMINI_API_KEY ausente — 503 evita vazar config.
        logger.error("Provedor LLM indisponível: {}", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Serviço de geração temporariamente indisponível.",
        ) from exc

    return StreamingResponse(
        itinerary_sse_stream(token_stream, f"uid={current_user.uid}"),
        media_type="text/event-stream",
        headers={
            # Evita buffering intermediário em proxies / CDN.
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
