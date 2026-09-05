"""
Rotas do proxy Google Places + reviews da comunidade Tripfy (RF07).

Chave server-side apenas — o frontend recebe URLs já resolvidas.
"""
from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request, status
from loguru import logger

from core.auth_middleware import CurrentUser, get_current_user
from core.rate_limit import limiter
from models.places import (
    PlaceAutocompleteResponse,
    PlaceDetailsResponse,
    PlaceFullDetailsResponse,
)
from models.review import PlaceReviewCreate, PlaceReviewResponse
from repositories import review_repository
from services import places_service
from services.places_service import validate_place_id

router = APIRouter(prefix="/places", tags=["places"])

_LOOKUP_LIMIT = "30/minute"
_AUTOCOMPLETE_LIMIT = "60/minute"
_DETAILS_LIMIT = "20/minute"
_REVIEWS_GET_LIMIT = "30/minute"
_REVIEWS_WRITE_LIMIT = "10/minute"


@router.get("/lookup", response_model=PlaceDetailsResponse)
@limiter.limit(_LOOKUP_LIMIT)
async def lookup_place(
    request: Request,
    query: str = Query(
        ...,
        min_length=2,
        max_length=200,
        description="Nome da atração / local (ex.: Torre de Belém)",
    ),
    lat: float | None = Query(default=None, ge=-90, le=90),
    lng: float | None = Query(default=None, ge=-180, le=180),
    current_user: CurrentUser = Depends(get_current_user),
) -> PlaceDetailsResponse:
    """Resolve place_id, foto, nota e open_now via Places (New → legacy)."""
    if (lat is None) ^ (lng is None):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Informe lat e lng juntos, ou omita ambos.",
        )

    logger.info(
        "Places lookup: uid={} query={!r} has_coords={}",
        current_user.uid,
        query[:80],
        lat is not None,
    )
    return await places_service.lookup_place(query, lat=lat, lng=lng)


@router.get("/autocomplete", response_model=PlaceAutocompleteResponse)
@limiter.limit(_AUTOCOMPLETE_LIMIT)
async def autocomplete_places(
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    term: str = Query(
        ...,
        alias="input",
        min_length=2,
        max_length=120,
        description="Prefixo digitado (ex.: Par)",
    ),
) -> PlaceAutocompleteResponse:
    """Sugestões de destino (Place Autocomplete). Lista vazia = nenhum palpite."""
    logger.info(
        "Places autocomplete: uid={} input={!r}",
        current_user.uid,
        term[:80],
    )
    return await places_service.autocomplete_places(term)


@router.get("/reviews/me", response_model=list[PlaceReviewResponse])
@limiter.limit(_REVIEWS_GET_LIMIT)
async def list_my_reviews(
    request: Request,
    limit: int = Query(default=50, ge=1, le=100),
    current_user: CurrentUser = Depends(get_current_user),
) -> list[PlaceReviewResponse]:
    """Todas as avaliações do usuário autenticado (antes de /{place_id}/…)."""
    logger.info(
        "Listando minhas reviews: uid={} limit={}",
        current_user.uid,
        limit,
    )
    return await review_repository.list_by_user(current_user.uid, limit=limit)


@router.get("/{place_id}/details", response_model=PlaceFullDetailsResponse)
@limiter.limit(_DETAILS_LIMIT)
async def get_place_details(
    request: Request,
    place_id: str = Path(..., min_length=10, max_length=256),
    current_user: CurrentUser = Depends(get_current_user),
) -> PlaceFullDetailsResponse:
    """Painel rico do local (endereço, horários, fotos, preço, menu se houver)."""
    cleaned = validate_place_id(place_id)
    logger.info(
        "Places details: uid={} place_id={}",
        current_user.uid,
        cleaned[:40],
    )
    return await places_service.get_place_details(cleaned)


@router.get("/{place_id}/reviews", response_model=list[PlaceReviewResponse])
@limiter.limit(_REVIEWS_GET_LIMIT)
async def list_place_reviews(
    request: Request,
    place_id: str = Path(..., min_length=10, max_length=256),
    limit: int = Query(default=20, ge=1, le=50),
    current_user: CurrentUser = Depends(get_current_user),
) -> list[PlaceReviewResponse]:
    """Lista avaliações da comunidade Tripfy para o lugar."""
    cleaned = validate_place_id(place_id)
    logger.info(
        "Listando reviews: uid={} place_id={} limit={}",
        current_user.uid,
        cleaned[:40],
        limit,
    )
    return await review_repository.list_by_place(cleaned, limit=limit)


@router.post(
    "/{place_id}/reviews",
    response_model=PlaceReviewResponse,
    status_code=status.HTTP_200_OK,
)
@limiter.limit(_REVIEWS_WRITE_LIMIT)
async def upsert_place_review(
    request: Request,
    body: PlaceReviewCreate,
    place_id: str = Path(..., min_length=10, max_length=256),
    current_user: CurrentUser = Depends(get_current_user),
) -> PlaceReviewResponse:
    """Cria ou atualiza o review do usuário autenticado neste lugar."""
    cleaned = validate_place_id(place_id)
    logger.info(
        "Upsert review: uid={} place_id={} rating={}",
        current_user.uid,
        cleaned[:40],
        body.rating,
    )
    return await review_repository.upsert(
        cleaned,
        current_user.uid,
        body.rating,
        body.comment,
        place_name=body.place_name,
    )


@router.delete(
    "/{place_id}/reviews/me",
    status_code=status.HTTP_204_NO_CONTENT,
)
@limiter.limit(_REVIEWS_WRITE_LIMIT)
async def delete_own_place_review(
    request: Request,
    place_id: str = Path(..., min_length=10, max_length=256),
    current_user: CurrentUser = Depends(get_current_user),
) -> None:
    """Remove o review do próprio usuário."""
    cleaned = validate_place_id(place_id)
    deleted = await review_repository.delete_own(cleaned, current_user.uid)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Você ainda não avaliou este lugar.",
        )
