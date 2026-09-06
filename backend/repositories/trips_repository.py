"""
Persistência de roteiros em users/{uid}/trips (Admin SDK).

Soft delete: `deleted_at` (null = ativo). Lixeira = 30 dias.
Índice `trip_shares/{tripId}` → owner_uid pra deep link / clone (RF09).
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any

from firebase_admin import firestore
from loguru import logger
from starlette.concurrency import run_in_threadpool

from core.firebase import db
from models.trip import (
    ActivityResponse,
    PersistedDay,
    SavedTripResponse,
)

_SHARES = "trip_shares"
_TRASH_DAYS = 30


def _trips_col(uid: str):
    return db.collection("users").document(uid).collection("trips")


def _as_bool(value: Any, *, default: bool = False) -> bool:
    """Só aceita bool real — string "false" não vira True."""
    if isinstance(value, bool):
        return value
    return default


def _parse_iso_date(value: Any) -> date | None:
    """ISO YYYY-MM-DD a partir de string, date ou datetime do Firestore."""
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.date()
    if type(value) is date:
        return value
    if isinstance(value, str):
        text = value.strip()[:10]
        try:
            return date.fromisoformat(text)
        except ValueError:
            return None
    return None


def _parse_activity(raw: dict[str, Any]) -> ActivityResponse:
    return ActivityResponse(
        time=str(raw.get("time") or ""),
        title=str(raw.get("title") or ""),
        description=str(raw.get("description") or ""),
        location=str(raw.get("location") or ""),
        latitude=raw.get("latitude"),
        longitude=raw.get("longitude"),
        requires_ticket=_as_bool(raw.get("requires_ticket")),
    )


def _parse_days(raw_days: Any) -> list[PersistedDay]:
    if not isinstance(raw_days, list):
        return []
    days: list[PersistedDay] = []
    for d in raw_days:
        if not isinstance(d, dict):
            continue
        acts_raw = d.get("activities") or []
        activities = [
            _parse_activity(a) for a in acts_raw if isinstance(a, dict)
        ]
        try:
            day_num = int(d.get("day") or 1)
        except (TypeError, ValueError):
            day_num = 1
        days.append(
            PersistedDay(
                day=day_num,
                title=str(d.get("title") or ""),
                activities=activities,
            )
        )
    return days


def _as_datetime(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    return None


def _doc_to_saved(
    trip_id: str,
    data: dict[str, Any],
    *,
    viewer_uid: str,
) -> SavedTripResponse:
    owner = str(data.get("owner_uid") or "")
    is_owner = owner == viewer_uid
    deleted_at = _as_datetime(data.get("deleted_at"))
    return SavedTripResponse(
        id=trip_id,
        owner_uid=owner,
        destination=str(data.get("destination") or ""),
        title=str(data.get("title") or "").strip(),
        summary=str(data.get("summary") or ""),
        tips=[
            str(t).strip()
            for t in (data.get("tips") or [])
            if isinstance(t, str) and str(t).strip()
        ],
        notes=str(data.get("notes") or ""),
        days=_parse_days(data.get("days")),
        start_date=_parse_iso_date(data.get("start_date")),
        end_date=_parse_iso_date(data.get("end_date")),
        match_id=(
            str(data["match_id"]).strip()
            if isinstance(data.get("match_id"), str)
            and str(data["match_id"]).strip()
            else None
        ),
        deleted_at=deleted_at,
        cloned_from=(
            str(data["cloned_from"])
            if isinstance(data.get("cloned_from"), str)
            else None
        ),
        created_at=_as_datetime(data.get("created_at")),
        updated_at=_as_datetime(data.get("updated_at")),
        is_owner=is_owner,
        # Visitante só lê; dono edita (mesmo se veio da lixeira — UI decide).
        read_only=not is_owner,
    )


def _itinerary_payload(data: dict[str, Any]) -> dict[str, Any]:
    """Copia só o miolo do roteiro pra clone (sem metadados de dono/lixeira)."""
    days_out: list[dict[str, Any]] = []
    for d in data.get("days") or []:
        if not isinstance(d, dict):
            continue
        acts = []
        for a in d.get("activities") or []:
            if not isinstance(a, dict):
                continue
            acts.append(
                {
                    "time": a.get("time"),
                    "title": a.get("title"),
                    "description": a.get("description"),
                    "location": a.get("location"),
                    "latitude": a.get("latitude"),
                    "longitude": a.get("longitude"),
                    "requires_ticket": _as_bool(a.get("requires_ticket")),
                }
            )
        days_out.append(
            {
                "day": d.get("day"),
                "title": d.get("title"),
                "activities": acts,
            }
        )
    start = _parse_iso_date(data.get("start_date"))
    end = _parse_iso_date(data.get("end_date"))
    return {
        "destination": data.get("destination") or "",
        "title": str(data.get("title") or "").strip(),
        "summary": data.get("summary") or "",
        "notes": data.get("notes") or "",
        "tips": [
            str(t)
            for t in (data.get("tips") or [])
            if isinstance(t, str) and str(t).strip()
        ],
        "days": days_out,
        "start_date": start.isoformat() if start else None,
        "end_date": end.isoformat() if end else None,
    }


def _is_in_trash_window(deleted_at: datetime | None) -> bool:
    if deleted_at is None:
        return False
    if deleted_at.tzinfo is None:
        deleted_at = deleted_at.replace(tzinfo=timezone.utc)
    cutoff = datetime.now(timezone.utc) - timedelta(days=_TRASH_DAYS)
    return deleted_at >= cutoff


def _write_share_index(trip_id: str, owner_uid: str) -> None:
    db.collection(_SHARES).document(trip_id).set(
        {"owner_uid": owner_uid, "trip_id": trip_id},
        merge=True,
    )


def _resolve_owner(trip_id: str) -> str | None:
    snap = db.collection(_SHARES).document(trip_id).get()
    if snap.exists:
        owner = (snap.to_dict() or {}).get("owner_uid")
        if isinstance(owner, str) and owner:
            return owner
    return None


async def list_active(uid: str) -> list[SavedTripResponse]:
    """Viagens do uid com deleted_at ausente/null."""

    def _fetch() -> list[SavedTripResponse]:
        snaps = _trips_col(uid).stream()
        items: list[SavedTripResponse] = []
        for snap in snaps:
            data = snap.to_dict() or {}
            if data.get("deleted_at") is not None:
                continue
            items.append(_doc_to_saved(snap.id, data, viewer_uid=uid))

        def _sort_key(t: SavedTripResponse) -> datetime:
            return t.updated_at or t.created_at or datetime.min.replace(
                tzinfo=timezone.utc
            )

        items.sort(key=_sort_key, reverse=True)
        return items

    return await run_in_threadpool(_fetch)


async def list_trash(uid: str) -> list[SavedTripResponse]:
    """Lixeira: deletadas há ≤30 dias."""

    def _fetch() -> list[SavedTripResponse]:
        snaps = _trips_col(uid).stream()
        items: list[SavedTripResponse] = []
        for snap in snaps:
            data = snap.to_dict() or {}
            deleted_at = _as_datetime(data.get("deleted_at"))
            if not _is_in_trash_window(deleted_at):
                continue
            items.append(_doc_to_saved(snap.id, data, viewer_uid=uid))

        def _sort_key(t: SavedTripResponse) -> datetime:
            return t.deleted_at or datetime.min.replace(tzinfo=timezone.utc)

        items.sort(key=_sort_key, reverse=True)
        return items

    return await run_in_threadpool(_fetch)


async def count_active(uid: str) -> int:
    """Conta ativas. ponytail: scan O(n); upgrade = active_trip_count no user."""

    def _count() -> int:
        n = 0
        for snap in _trips_col(uid).stream():
            data = snap.to_dict() or {}
            if data.get("deleted_at") is None:
                n += 1
        return n

    return await run_in_threadpool(_count)


async def get_trip(trip_id: str, viewer_uid: str) -> SavedTripResponse | None:
    """
    Busca via índice trip_shares.
    Dono vê mesmo na lixeira; visitante só se ativa (não deletada).
    """

    def _fetch() -> SavedTripResponse | None:
        owner = _resolve_owner(trip_id)
        if not owner:
            # Fallback: doc do próprio viewer (trips antigas sem índice).
            snap = _trips_col(viewer_uid).document(trip_id).get()
            if not snap.exists:
                return None
            data = snap.to_dict() or {}
            data.setdefault("owner_uid", viewer_uid)
            return _doc_to_saved(snap.id, data, viewer_uid=viewer_uid)

        snap = _trips_col(owner).document(trip_id).get()
        if not snap.exists:
            return None
        data = snap.to_dict() or {}
        data.setdefault("owner_uid", owner)
        deleted = data.get("deleted_at") is not None
        if deleted and owner != viewer_uid:
            return None
        return _doc_to_saved(snap.id, data, viewer_uid=viewer_uid)

    return await run_in_threadpool(_fetch)


async def soft_delete(uid: str, trip_id: str) -> bool:
    """Marca deleted_at; False se não existir ou já não for do uid."""

    def _write() -> bool:
        ref = _trips_col(uid).document(trip_id)
        snap = ref.get()
        if not snap.exists:
            return False
        ref.update(
            {
                "deleted_at": firestore.SERVER_TIMESTAMP,
                "updated_at": firestore.SERVER_TIMESTAMP,
            }
        )
        logger.info("Trip soft-delete: uid={} trip_id={}", uid, trip_id)
        return True

    return await run_in_threadpool(_write)


async def restore(uid: str, trip_id: str) -> bool:
    """Remove deleted_at se ainda estiver na janela de 30 dias."""

    def _write() -> bool:
        ref = _trips_col(uid).document(trip_id)
        snap = ref.get()
        if not snap.exists:
            return False
        data = snap.to_dict() or {}
        deleted_at = _as_datetime(data.get("deleted_at"))
        if not _is_in_trash_window(deleted_at):
            return False
        ref.update(
            {
                "deleted_at": None,
                "updated_at": firestore.SERVER_TIMESTAMP,
            }
        )
        logger.info("Trip restore: uid={} trip_id={}", uid, trip_id)
        return True

    return await run_in_threadpool(_write)


async def clone_trip(source_trip_id: str, new_owner_uid: str) -> str | None:
    """Copia roteiro ativo pra new_owner; retorna novo trip_id ou None."""

    def _write() -> str | None:
        owner = _resolve_owner(source_trip_id)
        source_snap = None
        if owner:
            source_snap = _trips_col(owner).document(source_trip_id).get()
        if source_snap is None or not source_snap.exists:
            # Tenta no próprio usuário (sem índice).
            source_snap = _trips_col(new_owner_uid).document(source_trip_id).get()
            if not source_snap.exists:
                return None
            owner = new_owner_uid

        data = source_snap.to_dict() or {}
        if data.get("deleted_at") is not None:
            return None

        payload = _itinerary_payload(data)
        new_ref = _trips_col(new_owner_uid).document()
        new_ref.set(
            {
                **payload,
                "owner_uid": new_owner_uid,
                "trip_id": new_ref.id,
                "cloned_from": source_trip_id,
                "deleted_at": None,
                "created_at": firestore.SERVER_TIMESTAMP,
                "updated_at": firestore.SERVER_TIMESTAMP,
            }
        )
        _write_share_index(new_ref.id, new_owner_uid)
        logger.info(
            "Trip clonado: from={} to_uid={} new_id={}",
            source_trip_id,
            new_owner_uid,
            new_ref.id,
        )
        return new_ref.id

    return await run_in_threadpool(_write)


async def create_trip(
    uid: str,
    itinerary: dict[str, Any],
    *,
    match_id: str | None = None,
) -> str:
    """Cria viagem ativa + índice trip_shares. Caller já passou no entitlement."""

    def _write() -> str:
        payload = _itinerary_payload(itinerary)
        new_ref = _trips_col(uid).document()
        body: dict[str, Any] = {
            **payload,
            "owner_uid": uid,
            "trip_id": new_ref.id,
            "deleted_at": None,
            "created_at": firestore.SERVER_TIMESTAMP,
            "updated_at": firestore.SERVER_TIMESTAMP,
        }
        if match_id:
            body["match_id"] = match_id
        new_ref.set(body)
        _write_share_index(new_ref.id, uid)
        logger.info("Trip criada: uid={} trip_id={}", uid, new_ref.id)
        return new_ref.id

    return await run_in_threadpool(_write)
