"""
Casos de uso do Match de Viajantes (RF11/RF12).

Valida os perfis e traduz falhas de domínio para o contrato HTTP. A persistência
e o controle de concorrência ficam no Repository.
"""
import asyncio
from collections.abc import AsyncIterator
from contextlib import suppress

from fastapi import HTTPException, status
from headroom import compress
from loguru import logger

from core.llm_provider import LLMProvider, get_llm_provider
from core.prompt_engineering import build_match_prompt
from models.match import (
    CreateMatchRequest,
    MatchInDB,
    MatchInviteSummary,
    MatchStatus,
)
from models.trip import ItineraryResponse
from models.user import TravelPreferences
from repositories import match_repository, user_repository


async def _require_travel_preferences(uid: str) -> None:
    """Garante que o participante tenha perfil apto à geração futura."""
    user = await user_repository.get_user(uid)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuário não encontrado. Faça sync em /auth/sync primeiro.",
        )
    if user.travel_preferences is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Complete as preferências de viagem antes de usar o Match.",
        )


async def create_match(owner_uid: str, request: CreateMatchRequest) -> MatchInDB:
    """Cria uma sessão vinculada ao usuário autenticado."""
    await _require_travel_preferences(owner_uid)
    return await match_repository.create_match(owner_uid, request)


async def get_match_for_viewer(
    match_id: str,
    viewer_uid: str,
) -> MatchInDB | MatchInviteSummary:
    """Retorna resumo pré-join ou documento completo para um participante."""
    match = await match_repository.get_match(match_id)
    if match is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sessão de Match não encontrada.",
        )
    if viewer_uid in match.participants:
        return match
    if match.status == MatchStatus.WAITING:
        return MatchInviteSummary(
            id=match.id,
            destination=match.destination,
            days=match.days,
            budget=match.budget,
            status=match.status,
        )
    # Não confirma a existência de sessões fechadas para terceiros.
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Sessão de Match não encontrada.",
    )


async def join_match(match_id: str, participant_uid: str) -> MatchInDB:
    """Valida o convidado e ingressa na sessão compartilhada."""
    await _require_travel_preferences(participant_uid)

    try:
        return await match_repository.join_match(match_id, participant_uid)
    except match_repository.MatchNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sessão de Match não encontrada.",
        ) from exc
    except match_repository.MatchOwnerJoinError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="O criador da sessão já participa deste Match.",
        ) from exc
    except match_repository.MatchFullError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Esta sessão já atingiu o limite de 2 viajantes.",
        ) from exc
    except match_repository.MatchUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Esta sessão não aceita novos participantes.",
        ) from exc


async def _stream_and_persist_itinerary(
    match: MatchInDB,
    owner_uid: str,
    lock_token: str,
    token_stream: AsyncIterator[str],
) -> AsyncIterator[str]:
    """Valida e persiste o JSON antes de encerrar o SSE com sucesso."""
    accumulated = ""
    persisted = False
    try:
        async for token in token_stream:
            accumulated += token
            yield token

        itinerary = ItineraryResponse.model_validate_json(accumulated)
        await match_repository.complete_match_with_itinerary(
            match.id,
            owner_uid,
            lock_token,
            itinerary,
        )
        persisted = True
    finally:
        if not persisted:
            # Shield evita abandonar o lock quando o cliente fecha o SSE.
            with suppress(Exception):
                await asyncio.shield(
                    match_repository.release_generation_lock(
                        match.id,
                        owner_uid,
                        lock_token,
                    )
                )


async def generate_match_itinerary_stream(
    match_id: str,
    requester_uid: str,
    provider: LLMProvider | None = None,
) -> AsyncIterator[str]:
    """Busca os dois perfis, monta o prompt conjunto e inicia o stream do RF12."""
    try:
        match, lock_token = await match_repository.claim_generation(
            match_id,
            requester_uid,
        )
    except match_repository.MatchNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sessão de Match não encontrada.",
        ) from exc
    except match_repository.GenerationOwnerError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas o criador pode iniciar a geração.",
        ) from exc
    except match_repository.GenerationInProgressError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A geração desta sessão já está em andamento.",
        ) from exc
    except match_repository.MatchUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A sessão precisa de 2 viajantes e status generating.",
        ) from exc

    try:
        users = await asyncio.gather(
            *(user_repository.get_user(uid) for uid in match.participants)
        )

        preferences: list[TravelPreferences] = []
        for user in users:
            if user is None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Um dos participantes não possui perfil válido.",
                )
            if user.travel_preferences is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Todos os participantes precisam completar as preferências.",
                )
            preferences.append(user.travel_preferences)

        user_prompt = build_match_prompt(match, preferences)
        compressed = compress([{"role": "user", "content": user_prompt}])
        final_prompt = compressed.messages[0]["content"]
        logger.info(
            "Prompt de Match comprimido: match_id={} destino={} dias={} "
            "tokens_before={} tokens_after={} ratio={:.2f}",
            match.id,
            match.destination,
            match.days,
            compressed.tokens_before,
            compressed.tokens_after,
            compressed.compression_ratio,
        )

        llm = provider or get_llm_provider()
        return _stream_and_persist_itinerary(
            match,
            requester_uid,
            lock_token,
            llm.generate_itinerary_stream(final_prompt),
        )
    except BaseException:
        with suppress(Exception):
            await asyncio.shield(
                match_repository.release_generation_lock(
                    match.id,
                    requester_uid,
                    lock_token,
                )
            )
        raise
