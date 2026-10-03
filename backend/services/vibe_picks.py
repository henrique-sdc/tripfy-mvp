"""Três cidades da Home. O roteiro só nasce no toque."""

from __future__ import annotations

from datetime import date

from fastapi import HTTPException, status
from headroom import compress
from loguru import logger

from core.llm_provider import get_llm_provider
from core.prompt_engineering import build_vibe_picks_prompt
from models.user import (
    TravelPreferences,
    VibePick,
    VibePickOpenResponse,
    VibePicksResponse,
)
from repositories import trips_repository, user_repository
from services import entitlement_service
from services.vibe_window import (
    VIBE_PICK_COUNT,
    VIBE_TRIP_DAYS,
    four_day_window,
    prefs_key,
)


def _prefs_or_400(user: object) -> TravelPreferences:
    prefs = getattr(user, "travel_preferences", None)
    if not isinstance(prefs, TravelPreferences):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Complete as preferências de viagem antes.",
        )
    return prefs


async def ensure_vibe_picks(uid: str) -> VibePicksResponse:
    """Devolve as 3 cidades. LLM só se a vibe mudou."""
    user = await user_repository.get_user(uid)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuário não encontrado.",
        )
    prefs = _prefs_or_400(user)
    key = prefs_key(prefs)
    stored_key, picks = await user_repository.read_vibe_picks(uid)
    if stored_key == key and len(picks) == VIBE_PICK_COUNT:
        return VibePicksResponse(picks=picks)

    prompt = build_vibe_picks_prompt(prefs)
    compressed = compress([{"role": "user", "content": prompt}])
    final_prompt = compressed.messages[0]["content"]
    try:
        fresh = await get_llm_provider().suggest_destinations(final_prompt)
    except Exception as exc:
        logger.warning("Vibe picks falhou: uid={} err={}", uid, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Não deu pra sugerir destinos agora.",
        ) from exc
    await user_repository.write_vibe_picks(uid, key, fresh)
    logger.info("Vibe picks novos: uid={}", uid)
    return VibePicksResponse(picks=fresh)


async def open_vibe_pick(uid: str, index: int) -> VibePickOpenResponse:
    """trip_id abre a viagem. Sem id, libera a geração se couber no teto."""
    user = await user_repository.get_user(uid)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuário não encontrado.",
        )
    prefs = _prefs_or_400(user)
    _key, picks = await user_repository.read_vibe_picks(uid)
    if index < 0 or index >= len(picks):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Destino não encontrado.",
        )
    pick = picks[index]
    if pick.trip_id:
        return VibePickOpenResponse(
            trip_id=pick.trip_id,
            generate=False,
            destination=pick.destination,
        )
    await entitlement_service.assert_can_add_active_trip(uid)
    start, end = four_day_window(date.today())
    return VibePickOpenResponse(
        trip_id=None,
        generate=True,
        destination=pick.destination,
        budget=prefs.budget_range.value,
        days=VIBE_TRIP_DAYS,
        start_date=start.isoformat(),
        end_date=end.isoformat(),
    )


async def attach_vibe_pick_trip(
    uid: str,
    index: int,
    trip_id: str,
) -> VibePicksResponse:
    trip = await trips_repository.get_trip(trip_id, uid)
    if trip is None or not trip.is_owner:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Viagem não encontrada.",
        )
    try:
        picks = await user_repository.bind_vibe_pick_trip(uid, index, trip_id)
    except IndexError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Destino não encontrado.",
        ) from exc
    return VibePicksResponse(picks=picks)
