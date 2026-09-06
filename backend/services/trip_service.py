"""
Use Case de geração de roteiro (RF06).

Orquestra: Firestore (perfil) + engenharia de prompt + LLM abstrato.
O Service NÃO importa o SDK do Google — só a interface LLMProvider.
"""
from collections.abc import AsyncIterator

from fastapi import HTTPException, status
from headroom import compress
from loguru import logger

from core.llm_provider import LLMProvider, get_llm_provider
from core.prompt_engineering import build_user_prompt
from models.trip import (
    CloneTripResponse,
    CreateTripRequest,
    GenerateTripRequest,
    SavedTripResponse,
)
from repositories import trips_repository, user_repository
from services import entitlement_service


async def generate_itinerary_stream(
    uid: str,
    request: GenerateTripRequest,
    provider: LLMProvider | None = None,
) -> AsyncIterator[str]:
    """
    Busca personalidade no Firestore, monta o prompt e devolve o stream do LLM.

    `provider` é injetável para testes; em produção usa get_llm_provider().
    """
    user = await user_repository.get_user(uid)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuário não encontrado. Faça sync em /auth/sync primeiro.",
        )

    if user.travel_preferences is None:
        # Sem vibe salva, o roteiro sairia genérico — forçamos o onboarding.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Complete as preferências de viagem antes de gerar um roteiro.",
        )

    user_prompt = build_user_prompt(request, user.travel_preferences)

    # Headroom comprime o payload do usuário antes de gastar tokens no Gemini
    # (regra do projeto — custo variável da API Key, PRD Seção 7).
    compressed = compress([{"role": "user", "content": user_prompt}])
    final_prompt = compressed.messages[0]["content"]
    logger.info(
        "Prompt comprimido para geração: uid={} destino={} dias={} "
        "tokens_before={} tokens_after={} ratio={:.2f}",
        uid,
        request.destination,
        request.days,
        compressed.tokens_before,
        compressed.tokens_after,
        compressed.compression_ratio,
    )

    llm = provider or get_llm_provider()
    return llm.generate_itinerary_stream(final_prompt, day_count=request.days)


async def create_saved_trip(uid: str, body: CreateTripRequest) -> SavedTripResponse:
    """Persiste roteiro novo — gate Free de 2 ativas mora no entitlement."""
    await entitlement_service.assert_can_add_active_trip(uid)
    match_id = (body.match_id or "").strip() or None
    trip_id = await trips_repository.create_trip(
        uid,
        body.model_dump(mode="json"),
        match_id=match_id,
    )
    trip = await trips_repository.get_trip(trip_id, uid)
    if trip is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Viagem criada mas não foi possível reler.",
        )
    logger.info("Trip persistida: uid={} trip_id={}", uid, trip_id)
    return trip


async def clone_saved_trip(source_trip_id: str, uid: str) -> CloneTripResponse:
    await entitlement_service.assert_can_add_active_trip(uid)
    new_id = await trips_repository.clone_trip(source_trip_id, uid)
    if not new_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Não foi possível clonar esta viagem.",
        )
    trip = await trips_repository.get_trip(new_id, uid)
    destination = trip.destination if trip else ""
    logger.info(
        "Clone ok: uid={} from={} new={}",
        uid,
        source_trip_id,
        new_id,
    )
    return CloneTripResponse(id=new_id, destination=destination)


async def restore_saved_trip(trip_id: str, uid: str) -> SavedTripResponse:
    await entitlement_service.assert_can_add_active_trip(uid)
    ok = await trips_repository.restore(uid, trip_id)
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Viagem não está na lixeira ou expirou (>30 dias).",
        )
    trip = await trips_repository.get_trip(trip_id, uid)
    if trip is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Viagem não encontrada após restaurar.",
        )
    return trip
