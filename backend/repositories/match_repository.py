"""
Acesso à coleção `matches` no Firestore.

O SDK Admin é síncrono; as operações rodam no threadpool para não bloquear o
event loop do FastAPI. O ingresso usa transação para manter o limite de duas
pessoas mesmo sob requisições concorrentes.
"""
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from firebase_admin import firestore
from loguru import logger
from starlette.concurrency import run_in_threadpool

from core.firebase import db
from models.match import CreateMatchRequest, MatchInDB, MatchStatus
from models.trip import ItineraryResponse

_MATCHES_COLLECTION = "matches"
_GENERATION_LOCK_TTL = timedelta(minutes=15)


class MatchNotFoundError(Exception):
    """A sessão solicitada não existe."""


class MatchFullError(Exception):
    """A sessão já atingiu o limite do MVP."""


class MatchUnavailableError(Exception):
    """A sessão não aceita um novo participante no estado atual."""


class MatchOwnerJoinError(Exception):
    """O criador tentou aceitar o próprio convite."""


class GenerationInProgressError(Exception):
    """Outra requisição ainda possui o lock de geração."""


class GenerationOwnerError(Exception):
    """Um usuário diferente do proprietário tentou gerar."""


def _match_from_snapshot(snapshot) -> MatchInDB:
    """Valida um documento do Firestore e inclui seu ID no domínio."""
    return MatchInDB.model_validate({"id": snapshot.id, **snapshot.to_dict()})


async def get_match(match_id: str) -> MatchInDB | None:
    """Busca uma sessão; retorna None quando o documento não existe."""

    def _fetch() -> MatchInDB | None:
        snapshot = db.collection(_MATCHES_COLLECTION).document(match_id).get()
        if not snapshot.exists:
            return None
        return _match_from_snapshot(snapshot)

    return await run_in_threadpool(_fetch)


async def list_pending_by_owner(owner_uid: str) -> list[MatchInDB]:
    """Lobbies `waiting` do dono.

    Filtra status em memória pra evitar índice composto owner+status no MVP
    (dono tem poucas sessões). Upgrade: where status==waiting + índice.
    """

    def _list() -> list[MatchInDB]:
        snapshots = (
            db.collection(_MATCHES_COLLECTION)
            .where("owner_uid", "==", owner_uid)
            .stream()
        )
        pending: list[MatchInDB] = []
        for snapshot in snapshots:
            match = _match_from_snapshot(snapshot)
            if match.status == MatchStatus.WAITING:
                pending.append(match)
        # Mais recente primeiro — Home mostra o topo.
        pending.sort(key=lambda m: m.created_at, reverse=True)
        return pending

    return await run_in_threadpool(_list)


async def create_match(owner_uid: str, request: CreateMatchRequest) -> MatchInDB:
    """Cria uma sessão em espera com o proprietário como primeiro participante."""

    def _create() -> MatchInDB:
        document = db.collection(_MATCHES_COLLECTION).document()
        document.set(
            {
                **request.model_dump(mode="json"),
                "owner_uid": owner_uid,
                "participants": [owner_uid],
                "status": MatchStatus.WAITING.value,
                "created_at": firestore.SERVER_TIMESTAMP,
            }
        )
        return _match_from_snapshot(document.get())

    match = await run_in_threadpool(_create)
    logger.info("Sessão de Match criada: match_id={} owner_uid={}", match.id, owner_uid)
    return match


async def join_match(
    match_id: str,
    participant_uid: str,
    guest_notes: str = "",
) -> MatchInDB:
    """Adiciona o convidado e muda a sessão para `generating` de forma atômica."""

    def _join() -> MatchInDB:
        document = db.collection(_MATCHES_COLLECTION).document(match_id)
        transaction = db.transaction()

        @firestore.transactional
        def _join_in_transaction(transaction) -> MatchInDB:
            snapshot = document.get(transaction=transaction)
            if not snapshot.exists:
                raise MatchNotFoundError

            match = _match_from_snapshot(snapshot)
            if participant_uid == match.owner_uid:
                raise MatchOwnerJoinError

            # Repetir a mesma aceitação é seguro após timeout/retry do cliente.
            if participant_uid in match.participants:
                if guest_notes and guest_notes != match.guest_notes:
                    transaction.update(document, {"guest_notes": guest_notes})
                    return match.model_copy(update={"guest_notes": guest_notes})
                return match

            if len(match.participants) >= 2:
                raise MatchFullError
            if match.status != MatchStatus.WAITING:
                raise MatchUnavailableError

            participants = [*match.participants, participant_uid]
            transaction.update(
                document,
                {
                    "participants": participants,
                    "status": MatchStatus.GENERATING.value,
                    "guest_notes": guest_notes,
                },
            )
            return match.model_copy(
                update={
                    "participants": participants,
                    "status": MatchStatus.GENERATING,
                    "guest_notes": guest_notes,
                }
            )

        return _join_in_transaction(transaction)

    match = await run_in_threadpool(_join)
    logger.info(
        "Participante entrou no Match: match_id={} participant_uid={} status={}",
        match.id,
        participant_uid,
        match.status.value,
    )
    return match


async def claim_generation(match_id: str, owner_uid: str) -> tuple[MatchInDB, str]:
    """Reivindica atomicamente a única geração permitida para a sessão."""
    lock_token = uuid4().hex

    def _claim() -> MatchInDB:
        document = db.collection(_MATCHES_COLLECTION).document(match_id)
        transaction = db.transaction()

        @firestore.transactional
        def _claim_in_transaction(transaction) -> MatchInDB:
            snapshot = document.get(transaction=transaction)
            if not snapshot.exists:
                raise MatchNotFoundError

            match = _match_from_snapshot(snapshot)
            if owner_uid != match.owner_uid:
                raise GenerationOwnerError
            if match.status != MatchStatus.GENERATING or len(match.participants) != 2:
                raise MatchUnavailableError

            lock = match.generation_lock
            if lock is not None:
                lock_age = datetime.now(UTC) - lock.locked_at
                if lock_age < _GENERATION_LOCK_TTL:
                    raise GenerationInProgressError

            transaction.update(
                document,
                {
                    "generation_lock": {
                        "token": lock_token,
                        "locked_by": owner_uid,
                        "locked_at": firestore.SERVER_TIMESTAMP,
                    }
                },
            )
            return match

        return _claim_in_transaction(transaction)

    match = await run_in_threadpool(_claim)
    logger.info("Lock de geração adquirido: match_id={} owner_uid={}", match_id, owner_uid)
    return match, lock_token


async def complete_match_with_itinerary(
    match_id: str,
    owner_uid: str,
    lock_token: str,
    itinerary: ItineraryResponse,
) -> None:
    """Persiste o JSON validado se a requisição ainda possuir o lock."""

    def _complete() -> None:
        document = db.collection(_MATCHES_COLLECTION).document(match_id)
        transaction = db.transaction()

        @firestore.transactional
        def _complete_in_transaction(transaction) -> None:
            snapshot = document.get(transaction=transaction)
            if not snapshot.exists:
                raise MatchNotFoundError

            match = _match_from_snapshot(snapshot)
            lock = match.generation_lock
            if (
                match.status != MatchStatus.GENERATING
                or lock is None
                or lock.locked_by != owner_uid
                or lock.token != lock_token
            ):
                raise MatchUnavailableError

            transaction.update(
                document,
                {
                    "status": MatchStatus.COMPLETED.value,
                    "itinerary": itinerary.model_dump(mode="json"),
                    "completed_at": firestore.SERVER_TIMESTAMP,
                    "generation_lock": None,
                },
            )

        _complete_in_transaction(transaction)

    await run_in_threadpool(_complete)
    logger.info("Sessão de Match concluída: match_id={}", match_id)


async def release_generation_lock(
    match_id: str,
    owner_uid: str,
    lock_token: str,
) -> None:
    """Libera apenas o lock da requisição que falhou ou foi cancelada."""

    def _release() -> None:
        document = db.collection(_MATCHES_COLLECTION).document(match_id)
        transaction = db.transaction()

        @firestore.transactional
        def _release_in_transaction(transaction) -> None:
            snapshot = document.get(transaction=transaction)
            if not snapshot.exists:
                return

            match = _match_from_snapshot(snapshot)
            lock = match.generation_lock
            if (
                match.status == MatchStatus.GENERATING
                and lock is not None
                and lock.locked_by == owner_uid
                and lock.token == lock_token
            ):
                transaction.update(document, {"generation_lock": None})

        _release_in_transaction(transaction)

    await run_in_threadpool(_release)
    logger.info("Lock de geração liberado: match_id={}", match_id)
