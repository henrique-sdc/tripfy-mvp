"""
Acesso a dados da coleção `users/{uid}` no Firestore.

O client do firebase-admin é síncrono; para não bloquear o event loop do
FastAPI (RN04), cada operação de I/O é delegada a um threadpool via
run_in_threadpool. A camada de Services só enxerga métodos async.
"""
from datetime import datetime

from firebase_admin import firestore
from loguru import logger
from starlette.concurrency import run_in_threadpool

from core.firebase import db
from models.user import (
    SubscriptionTier,
    TravelPreferences,
    UserInDB,
    UserPublicProfile,
    VibePick,
)

_USERS_COLLECTION = "users"


def public_profile_from_user(user: UserInDB) -> UserPublicProfile:
    """
    Projeta UserInDB → fatia pública.

    Isolado do I/O para testes unitários sem Firestore e para garantir que
    email/created_at/companions nunca vazem no serializer.
    """
    prefs = user.travel_preferences
    return UserPublicProfile(
        uid=user.uid,
        name=user.name,
        bio=user.bio,
        photoBase64=user.photoBase64,
        interests=list(prefs.interests) if prefs else [],
        pace=prefs.pace if prefs else None,
    )


async def get_user(uid: str) -> UserInDB | None:
    """Busca o documento do usuário; retorna None se ainda não existir."""

    def _fetch() -> UserInDB | None:
        snapshot = db.collection(_USERS_COLLECTION).document(uid).get()
        if not snapshot.exists:
            return None
        # Pydantic valida os dados vindos do banco antes de subirem na aplicação.
        return UserInDB.model_validate(snapshot.to_dict())

    return await run_in_threadpool(_fetch)


async def get_public_profile(uid: str) -> UserPublicProfile | None:
    """Perfil público via Admin SDK — bypass das rules owner-only (LGPD)."""
    user = await get_user(uid)
    if user is None:
        return None
    return public_profile_from_user(user)


async def create_user_if_not_exists(uid: str, email: str) -> UserInDB:
    """
    Garante que exista um documento para o usuário recém-autenticado.

    Idempotente: se o documento já existe, apenas o retorna (não sobrescreve
    preferências já salvas). Chamado no primeiro login de cada sessão.
    """
    existing = await get_user(uid)
    if existing is not None:
        return existing

    def _create() -> None:
        db.collection(_USERS_COLLECTION).document(uid).set(
            {
                "uid": uid,
                "email": email,
                # SERVER_TIMESTAMP evita depender do relógio do servidor de app.
                "created_at": firestore.SERVER_TIMESTAMP,
                "travel_preferences": None,
                "tier": SubscriptionTier.FREE.value,
                "premium_until": None,
            }
        )

    await run_in_threadpool(_create)
    logger.info("Novo documento de usuário criado no Firestore: uid={}", uid)

    # Relê para retornar o created_at já resolvido pelo servidor do Firestore.
    created = await get_user(uid)
    if created is None:
        # Situação teoricamente impossível logo após um set bem-sucedido.
        raise RuntimeError(f"Documento do usuário {uid} não encontrado após criação.")
    return created


async def save_preferences(uid: str, preferences: TravelPreferences) -> None:
    """Persiste as preferências de viagem no perfil do usuário."""

    def _update() -> None:
        # merge=True para não apagar email/created_at ao gravar as preferências.
        db.collection(_USERS_COLLECTION).document(uid).set(
            {"travel_preferences": preferences.model_dump(mode="json")},
            merge=True,
        )

    await run_in_threadpool(_update)
    logger.info("Preferências de viagem salvas: uid={}", uid)


async def add_companion(my_uid: str, target_uid: str) -> None:
    """
    Amizade mútua: my ↔ target via ArrayUnion em batch.

    Quem aceita o link entra na lista de quem compartilhou e vice-versa.
    """

    def _update() -> None:
        me_ref = db.collection(_USERS_COLLECTION).document(my_uid)
        target_ref = db.collection(_USERS_COLLECTION).document(target_uid)
        batch = db.batch()
        batch.update(me_ref, {"companions": firestore.ArrayUnion([target_uid])})
        batch.update(target_ref, {"companions": firestore.ArrayUnion([my_uid])})
        batch.commit()

    await run_in_threadpool(_update)
    logger.info(
        "Companheiros vinculados (mútuo): my_uid={} target_uid={}",
        my_uid,
        target_uid,
    )


async def remove_companion(my_uid: str, target_uid: str) -> None:
    """Remove nos dois lados (ArrayRemove em batch — idempotente)."""

    def _update() -> None:
        me_ref = db.collection(_USERS_COLLECTION).document(my_uid)
        target_ref = db.collection(_USERS_COLLECTION).document(target_uid)
        batch = db.batch()
        batch.update(me_ref, {"companions": firestore.ArrayRemove([target_uid])})
        # Conta apagada do outro lado: ainda limpamos a nossa lista.
        if target_ref.get().exists:
            batch.update(
                target_ref, {"companions": firestore.ArrayRemove([my_uid])}
            )
        batch.commit()

    await run_in_threadpool(_update)
    logger.info(
        "Companheiros desvinculados (mútuo): my_uid={} target_uid={}",
        my_uid,
        target_uid,
    )


async def list_companions(my_uid: str) -> list[UserPublicProfile]:
    """
    Hidrata os UIDs em companions com a fatia pública.

    Docs apagados são ignorados (lista não quebra). N+1 ok no MVP.
    """
    me = await get_user(my_uid)
    if me is None or not me.companions:
        return []

    profiles: list[UserPublicProfile] = []
    for companion_uid in me.companions:
        profile = await get_public_profile(companion_uid)
        if profile is not None:
            profiles.append(profile)
    return profiles


async def update_subscription(
    uid: str,
    tier: SubscriptionTier,
    premium_until: datetime | None,
) -> UserInDB:
    """Grava billing. Só o Admin SDK — o client não escreve estes campos."""

    def _update() -> None:
        db.collection(_USERS_COLLECTION).document(uid).set(
            {
                "tier": tier.value,
                "premium_until": premium_until,
            },
            merge=True,
        )

    await run_in_threadpool(_update)
    logger.info(
        "Assinatura atualizada: uid={} tier={} premium_until={}",
        uid,
        tier.value,
        premium_until,
    )
    updated = await get_user(uid)
    if updated is None:
        raise RuntimeError(f"Documento do usuário {uid} sumiu após update de assinatura.")
    return updated


def _as_picks(raw: object) -> list[VibePick]:
    if not isinstance(raw, list):
        return []
    picks: list[VibePick] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        destination = str(item.get("destination") or "").strip()
        reason = str(item.get("reason") or "").strip() or destination
        if len(destination) < 2 or len(reason) < 2:
            continue
        trip_raw = item.get("trip_id")
        trip_id = trip_raw.strip() if isinstance(trip_raw, str) and trip_raw.strip() else None
        picks.append(
            VibePick(
                destination=destination[:80],
                reason=reason[:180],
                trip_id=trip_id,
            )
        )
    return picks[:3]


async def read_vibe_picks(uid: str) -> tuple[str | None, list[VibePick]]:
    def _read() -> tuple[str | None, list[VibePick]]:
        snap = db.collection(_USERS_COLLECTION).document(uid).get()
        data = snap.to_dict() if snap.exists else {}
        if not isinstance(data, dict):
            return None, []
        key = data.get("vibe_picks_key")
        stored = key.strip() if isinstance(key, str) and key.strip() else None
        return stored, _as_picks(data.get("vibe_picks"))

    return await run_in_threadpool(_read)


async def write_vibe_picks(uid: str, key: str, picks: list[VibePick]) -> None:
    def _write() -> None:
        db.collection(_USERS_COLLECTION).document(uid).set(
            {
                "vibe_picks_key": key,
                "vibe_picks": [pick.model_dump(mode="json") for pick in picks],
            },
            merge=True,
        )

    await run_in_threadpool(_write)
    logger.info("Vibe picks gravados: uid={} n={}", uid, len(picks))


async def bind_vibe_pick_trip(uid: str, index: int, trip_id: str) -> list[VibePick]:
    """Grava o id no card. Não mexe nos outros."""

    def _write() -> list[VibePick]:
        ref = db.collection(_USERS_COLLECTION).document(uid)
        snap = ref.get()
        data = snap.to_dict() if snap.exists else {}
        picks = _as_picks(data.get("vibe_picks") if isinstance(data, dict) else None)
        if index < 0 or index >= len(picks):
            raise IndexError
        picks[index] = picks[index].model_copy(update={"trip_id": trip_id})
        ref.set(
            {"vibe_picks": [pick.model_dump(mode="json") for pick in picks]},
            merge=True,
        )
        return picks

    return await run_in_threadpool(_write)


