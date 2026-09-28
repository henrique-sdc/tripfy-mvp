"""
Tokens de push, dedupe dos envios e o relógio do último tick.

Tudo via Admin SDK. O client não lê `notification_sends`.
"""

from __future__ import annotations

from datetime import UTC, datetime

from firebase_admin import firestore
from google.api_core.exceptions import AlreadyExists, Conflict
from loguru import logger
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool

from core.firebase import db
from models.user import PushDevice, UserInDB, merge_push_devices
from services.notification_rules import clamp_lookback

_USERS = "users"
_SENDS = "notification_sends"
_STATE = "notification_state"
_TICK_DOC = "tick"


def _aware(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


async def list_enabled_users() -> list[UserInDB]:
    """Quem ligou o push. ponytail: scan da coleção; upgrade = fila `notification_due`."""

    def _list() -> list[UserInDB]:
        snaps = (
            db.collection(_USERS)
            .where("notifications_enabled", "==", True)
            .stream()
        )
        users: list[UserInDB] = []
        for snap in snaps:
            data = snap.to_dict() or {}
            data.setdefault("uid", snap.id)
            try:
                users.append(UserInDB.model_validate(data))
            except ValidationError:
                logger.warning("Usuário ignorado no tick: uid={}", snap.id)
        return users

    return await run_in_threadpool(_list)


async def upsert_push_device(uid: str, incoming: PushDevice) -> None:
    """Marca o aparelho e liga o opt-in. Substitui o token se ele já existia."""

    def _write() -> None:
        ref = db.collection(_USERS).document(uid)
        snap = ref.get()
        if not snap.exists:
            raise LookupError
        try:
            user = UserInDB.model_validate(snap.to_dict() or {})
        except ValidationError as exc:
            raise LookupError from exc
        merged = merge_push_devices(user.push_devices, incoming)
        ref.set(
            {
                "push_devices": [
                    device.model_dump(mode="json") for device in merged
                ],
                "notifications_enabled": True,
            },
            merge=True,
        )

    await run_in_threadpool(_write)
    logger.info("Token de push gravado: uid={} platform={}", uid, incoming.platform.value)


async def remove_push_device(uid: str, token: str) -> None:
    """Tira este aparelho. Sem devices, o opt-in desliga."""

    def _write() -> None:
        ref = db.collection(_USERS).document(uid)
        snap = ref.get()
        if not snap.exists:
            return
        try:
            user = UserInDB.model_validate(snap.to_dict() or {})
        except ValidationError:
            return
        kept = [device for device in user.push_devices if device.token != token]
        ref.set(
            {
                "push_devices": [
                    device.model_dump(mode="json") for device in kept
                ],
                "notifications_enabled": bool(kept),
            },
            merge=True,
        )

    await run_in_threadpool(_write)
    logger.info("Token de push removido: uid={}", uid)


async def claim_send(dedupe_id: str) -> bool:
    """True só na primeira vez. create() perde a corrida com o outro cron."""

    def _claim() -> bool:
        ref = db.collection(_SENDS).document(dedupe_id)
        try:
            ref.create({"sent_at": firestore.SERVER_TIMESTAMP})
        except (AlreadyExists, Conflict):
            return False
        return True

    return await run_in_threadpool(_claim)


async def release_send(dedupe_id: str) -> None:
    """Envio não chegou em ninguém. O próximo tick pode tentar de novo."""

    def _delete() -> None:
        db.collection(_SENDS).document(dedupe_id).delete()

    await run_in_threadpool(_delete)


async def lookback_minutes(now: datetime) -> int:
    def _read() -> int:
        snap = db.collection(_STATE).document(_TICK_DOC).get()
        if not snap.exists:
            return clamp_lookback(None)
        raw = (snap.to_dict() or {}).get("last_run_at")
        if not isinstance(raw, datetime):
            return clamp_lookback(None)
        elapsed = (now - _aware(raw)).total_seconds() / 60
        return clamp_lookback(elapsed)

    return await run_in_threadpool(_read)


async def mark_tick(now: datetime) -> None:
    def _write() -> None:
        db.collection(_STATE).document(_TICK_DOC).set({"last_run_at": now})

    await run_in_threadpool(_write)
