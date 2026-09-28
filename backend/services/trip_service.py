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
    AcceptInviteRequest,
    CloneTripResponse,
    CreateTripRequest,
    GenerateTripRequest,
    InviteCreatedResponse,
    InvitePreviewResponse,
    SavedTripResponse,
    TripOpRequest,
    TripOpResponse,
)
from repositories import trips_repository, user_repository
from repositories.trips_repository import (
    CollabConflict,
    InviteFullError,
    TripAccessError,
    TripMissingError,
)
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


_CONFLICT_MESSAGES = {
    "activity_deleted": "Essa parada foi removida por outra pessoa.",
    "revision_conflict": "O roteiro mudou enquanto você editava.",
    "day_missing": "Esse dia não existe mais.",
    "day_conflict": "Esse dia já foi criado.",
    "last_activity": "O dia precisa de pelo menos uma parada.",
    "last_day": "A viagem precisa de pelo menos um dia.",
    "not_collab": "Esta viagem não está em edição conjunta.",
    "invalid_op": "Operação inválida.",
}


async def apply_saved_trip_op(
    trip_id: str,
    uid: str,
    body: TripOpRequest,
) -> TripOpResponse:
    """Árbitro da sala. O client não escreve o doc quando `collab` está ligado."""
    editor = await user_repository.get_user(uid)
    editor_name = editor.name.strip() if editor and editor.name else ""
    try:
        trip, applied = await trips_repository.apply_trip_op(
            trip_id,
            uid,
            body.model_dump(),
            editor_name=editor_name,
        )
    except TripMissingError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Viagem não encontrada.",
        ) from exc
    except TripAccessError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Você não participa desta viagem.",
        ) from exc
    except CollabConflict as exc:
        code = exc.code
        status_code = (
            status.HTTP_422_UNPROCESSABLE_ENTITY
            if code == "invalid_op"
            else status.HTTP_409_CONFLICT
        )
        raise HTTPException(
            status_code=status_code,
            detail={
                "code": code,
                "message": _CONFLICT_MESSAGES.get(code, "Não deu pra aplicar a edição."),
                "trip": exc.trip.model_dump(mode="json"),
            },
        ) from exc
    logger.info(
        "Trip op: uid={} trip_id={} type={} applied={} revision={}",
        uid,
        trip_id,
        body.type,
        applied,
        trip.revision,
    )
    return TripOpResponse(applied=applied, trip=trip)


def _missing_trip() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Viagem não encontrada.",
    )


def _not_owner() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Só quem criou a viagem pode fazer isso.",
    )


async def _owner_name(uid: str) -> str:
    user = await user_repository.get_user(uid)
    if user is None or not user.name:
        return ""
    return user.name.strip()


async def create_trip_invite(trip_id: str, uid: str) -> InviteCreatedResponse:
    try:
        token, expires = await trips_repository.create_invite(trip_id, uid)
    except TripMissingError as exc:
        raise _missing_trip() from exc
    except TripAccessError as exc:
        raise _not_owner() from exc
    return InviteCreatedResponse(token=token, expires_at=expires)


async def preview_trip_invite(token: str, uid: str) -> InvitePreviewResponse:
    raw = await trips_repository.read_invite(token, uid)
    if raw is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Convite inválido ou vencido.",
        )
    owner_name = await _owner_name(str(raw["owner_uid"]))
    return InvitePreviewResponse(
        trip_id=str(raw["trip_id"]),
        owner_name=owner_name,
        destination=str(raw["destination"]),
        title=str(raw["title"]),
        day_count=int(raw["day_count"]),
        already_member=bool(raw["already_member"]),
    )


async def accept_trip_invite(
    trip_id: str,
    uid: str,
    body: AcceptInviteRequest,
) -> SavedTripResponse:
    try:
        return await trips_repository.accept_invite(trip_id, uid, body.token)
    except TripMissingError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Convite inválido ou vencido.",
        ) from exc
    except InviteFullError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "trip_full",
                "message": "Esta viagem já tem um parceiro de edição.",
            },
        ) from exc


async def publish_saved_trip(trip_id: str, uid: str, *, public: bool) -> SavedTripResponse:
    try:
        return await trips_repository.set_trip_public(
            trip_id,
            uid,
            owner_name=await _owner_name(uid),
            public=public,
        )
    except TripMissingError as exc:
        raise _missing_trip() from exc
    except TripAccessError as exc:
        raise _not_owner() from exc
