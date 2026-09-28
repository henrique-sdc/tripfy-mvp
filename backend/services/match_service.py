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
    MatchIncomingInvite,
    MatchInviteSummary,
    MatchPendingSummary,
    MatchStatus,
)
from models.trip import ItineraryResponse
from models.user import TravelPreferences
from repositories import match_repository, trips_repository, user_repository
from services import entitlement_service


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


async def list_pending_matches(owner_uid: str) -> list[MatchPendingSummary]:
    """Resumos das salas waiting do dono — alimenta o banner da Home."""
    matches = await match_repository.list_pending_by_owner(owner_uid)
    logger.info(
        "Matches pendentes listados: owner_uid={} count={}",
        owner_uid,
        len(matches),
    )
    return [
        MatchPendingSummary(
            id=m.id,
            destination=m.destination,
            days=m.days,
            status=m.status,
            created_at=m.created_at,
        )
        for m in matches
    ]


async def list_incoming_invites(invitee_uid: str) -> list[MatchIncomingInvite]:
    """Convites waiting endereçados a este usuário."""
    matches = await match_repository.list_waiting_for_invitee(invitee_uid)
    invites: list[MatchIncomingInvite] = []
    for match in matches:
        owner = await user_repository.get_public_profile(match.owner_uid)
        invites.append(
            MatchIncomingInvite(
                id=match.id,
                destination=match.destination,
                owner_name=(owner.name.strip() if owner and owner.name else ""),
                owner_photo=owner.photoBase64 if owner else None,
            )
        )
    logger.info(
        "Convites de Match listados: invitee_uid={} count={}",
        invitee_uid,
        len(invites),
    )
    return invites


async def invite_companion(
    match_id: str,
    owner_uid: str,
    companion_uid: str,
) -> MatchInDB:
    """Marca um companheiro como convidado da sala."""
    target = companion_uid.strip()
    if not target or target == owner_uid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Escolha um companheiro para convidar.",
        )
    owner = await user_repository.get_user(owner_uid)
    if owner is None or target not in owner.companions:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Só dá pra convidar alguém da sua lista de companheiros.",
        )
    try:
        match = await match_repository.set_invitee(match_id, owner_uid, target)
    except match_repository.MatchNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sessão de Match não encontrada.",
        ) from exc
    except match_repository.MatchNotOwnerError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Só quem criou a sala pode convidar.",
        ) from exc
    except match_repository.MatchUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Esta sala não aceita convite agora.",
        ) from exc
    logger.info(
        "Convite de Match gravado: match_id={} owner_uid={} invitee_uid={}",
        match.id,
        owner_uid,
        target,
    )
    return match


async def decline_invite(match_id: str, invitee_uid: str) -> None:
    """O convidado recusa e some da Home."""
    try:
        await match_repository.clear_invitee(match_id, invitee_uid)
    except match_repository.MatchNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sessão de Match não encontrada.",
        ) from exc
    except match_repository.MatchInviteRestrictedError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Este convite não é seu.",
        ) from exc
    except match_repository.MatchUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Este convite não está mais aberto.",
        ) from exc
    logger.info(
        "Convite de Match recusado: match_id={} invitee_uid={}",
        match_id,
        invitee_uid,
    )


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
        owner_profile = await user_repository.get_public_profile(match.owner_uid)
        if owner_profile is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Sessão de Match não encontrada.",
            )
        return MatchInviteSummary(
            id=match.id,
            destination=match.destination,
            days=match.days,
            start_date=match.start_date,
            end_date=match.end_date,
            budget=match.budget,
            status=match.status,
            owner=owner_profile,
        )
    # Não confirma a existência de sessões fechadas para terceiros.
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Sessão de Match não encontrada.",
    )


async def join_match(
    match_id: str,
    participant_uid: str,
    notes: str = "",
) -> MatchInDB:
    """Valida o convidado e ingressa na sessão compartilhada."""
    await _require_travel_preferences(participant_uid)

    try:
        return await match_repository.join_match(
            match_id,
            participant_uid,
            guest_notes=notes,
        )
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
    except match_repository.MatchInviteRestrictedError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Este convite é para outra pessoa.",
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
        guest_uid = next(
            (uid for uid in match.participants if uid != owner_uid),
            None,
        )
        trip_id: str | None = None
        if guest_uid:
            payload = itinerary.model_dump(mode="json")
            if match.start_date is not None:
                payload["start_date"] = match.start_date.isoformat()
            if match.end_date is not None:
                payload["end_date"] = match.end_date.isoformat()
            if match.notes:
                payload["notes"] = match.notes
            try:
                # Conta como 1 viagem ativa do dono. O ponteiro do convidado não conta.
                await entitlement_service.assert_can_add_active_trip(owner_uid)
                trip_id = await trips_repository.create_collab_trip(
                    owner_uid,
                    guest_uid,
                    match.id,
                    payload,
                )
            except HTTPException as exc:
                logger.warning(
                    "Match sem viagem canônica: match_id={} status={}",
                    match.id,
                    exc.status_code,
                )
            except Exception:
                logger.exception(
                    "Falha ao criar viagem conjunta: match_id={}",
                    match.id,
                )
        try:
            await match_repository.complete_match_with_itinerary(
                match.id,
                owner_uid,
                lock_token,
                itinerary,
                trip_id=trip_id,
            )
            persisted = True
        except Exception:
            # Órfã contaria no teto Free se o complete falhar depois do create.
            if trip_id:
                with suppress(Exception):
                    await trips_repository.soft_delete(owner_uid, trip_id)
            raise
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
            llm.generate_itinerary_stream(final_prompt, day_count=match.days),
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
