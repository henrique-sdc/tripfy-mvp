"""
Persistência de roteiros em users/{uid}/trips (Admin SDK).

Soft delete: `deleted_at` (null = ativo). Lixeira = 30 dias.
Índice `trip_shares/{tripId}` → owner_uid pra deep link / clone (RF09).
"""
from __future__ import annotations

import secrets
import time
from datetime import date, datetime, timedelta, timezone
from typing import Any

from firebase_admin import firestore
from loguru import logger
from starlette.concurrency import run_in_threadpool

from core.firebase import db
from models.trip import (
    ChangeLogEntry,
    PersistedActivity,
    PersistedDay,
    SavedTripResponse,
)
from services.explore_week import apply_week_save, utc_week_id
from services.trip_invite import (
    decide_join,
    destination_key,
    invite_doc_id,
    valid_invite_token,
)
from services.trip_ops import (
    TripOpError,
    append_change_log,
    apply_op,
    clean_activity_id,
    describe_change,
    parse_change_log,
    stamp_activity_ids,
)

_SHARES = "trip_shares"
_INVITES = "trip_invites"
_EXPLORE = "explore_trips"
_SAVES = "explore_saves"
_TRASH_DAYS = 30
_INVITE_DAYS = 7


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


def _parse_place_id(value: Any) -> str | None:
    """Place ID curto; vazio/curto demais = None (roteiros antigos)."""
    if not isinstance(value, str):
        return None
    cleaned = value.strip()
    if cleaned.startswith("places/"):
        cleaned = cleaned[len("places/") :]
    return cleaned if len(cleaned) >= 10 else None


def _parse_activity(raw: dict[str, Any]) -> PersistedActivity:
    return PersistedActivity(
        id=clean_activity_id(raw.get("id")) or "",
        time=str(raw.get("time") or ""),
        title=str(raw.get("title") or ""),
        description=str(raw.get("description") or ""),
        location=str(raw.get("location") or ""),
        latitude=raw.get("latitude"),
        longitude=raw.get("longitude"),
        requires_ticket=_as_bool(raw.get("requires_ticket")),
        completed=_as_bool(raw.get("completed")),
        place_id=_parse_place_id(raw.get("place_id")),
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


def _as_coord(value: Any) -> float | None:
    """Coordenada gravada pelo tick de clima. Bool não é número."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value)


def _payload_day_field(value: Any) -> int | None:
    try:
        day = int(value)
    except (TypeError, ValueError):
        return None
    return day if day >= 1 else None


def _member_uids(data: dict[str, Any]) -> list[str]:
    raw = data.get("member_uids")
    if not isinstance(raw, list):
        return []
    return [uid for uid in raw if isinstance(uid, str) and uid]


def _is_member_pointer(data: dict[str, Any]) -> bool:
    """Ponteiro da Home do convidado — não é roteiro e não conta no teto Free."""
    return data.get("role") == "member"


def _doc_to_saved(
    trip_id: str,
    data: dict[str, Any],
    *,
    viewer_uid: str,
) -> SavedTripResponse:
    owner = str(data.get("owner_uid") or "")
    is_owner = owner == viewer_uid
    members = _member_uids(data)
    collab = _as_bool(data.get("collab"))
    is_member = viewer_uid in members
    deleted_at = _as_datetime(data.get("deleted_at"))
    if _is_member_pointer(data):
        role = "member"
    elif is_owner:
        role = "owner"
    elif is_member:
        role = "member"
    else:
        role = "viewer"
    try:
        revision = int(data.get("revision") or 0)
    except (TypeError, ValueError):
        revision = 0
    try:
        day_count = int(data.get("day_count") or 0)
    except (TypeError, ValueError):
        day_count = 0
    days = _parse_days(data.get("days"))
    if day_count <= 0:
        day_count = len(days)
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
        days=days,
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
        # Membro do Match edita. Visitante do link continua só leitura.
        read_only=not (is_owner or (collab and is_member)),
        collab=collab,
        revision=revision,
        member_uids=members,
        last_op_id=(
            str(data["last_op_id"])
            if isinstance(data.get("last_op_id"), str) and data["last_op_id"]
            else None
        ),
        updated_by=(
            str(data["updated_by"])
            if isinstance(data.get("updated_by"), str) and data["updated_by"]
            else None
        ),
        updated_by_name=str(data.get("updated_by_name") or "").strip(),
        last_change=(
            str(data["last_change"])
            if isinstance(data.get("last_change"), str) and data["last_change"]
            else None
        ),
        last_change_day=_payload_day_field(data.get("last_change_day")),
        change_log=[
            ChangeLogEntry.model_validate(item)
            for item in parse_change_log(data.get("change_log"))
        ],
        role=role,
        day_count=day_count,
        destination_lat=_as_coord(data.get("destination_lat")),
        destination_lng=_as_coord(data.get("destination_lng")),
        is_public=_as_bool(data.get("is_public")),
    )


def _itinerary_payload(
    data: dict[str, Any],
    *,
    reset_completed: bool = False,
    refresh_ids: bool = False,
) -> dict[str, Any]:
    """Copia o miolo do roteiro (clone/create) — sem metadados de dono/lixeira.

    Clone zera `completed` (viagem nova) e conserva `place_id` (mesmo lugar).
    """
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
                    "id": (
                        ""
                        if refresh_ids
                        else clean_activity_id(a.get("id")) or ""
                    ),
                    "time": a.get("time"),
                    "title": a.get("title"),
                    "description": a.get("description"),
                    "location": a.get("location"),
                    "latitude": a.get("latitude"),
                    "longitude": a.get("longitude"),
                    "requires_ticket": _as_bool(a.get("requires_ticket")),
                    "completed": (
                        False
                        if reset_completed
                        else _as_bool(a.get("completed"))
                    ),
                    "place_id": _parse_place_id(a.get("place_id")),
                }
            )
        days_out.append(
            {
                "day": d.get("day"),
                "title": d.get("title"),
                "activities": acts,
            }
        )
    days_out = stamp_activity_ids(days_out)
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


async def cache_destination_coords(
    owner_uid: str,
    trip_id: str,
    lat: float,
    lng: float,
) -> None:
    """Guarda o geocoding do destino no doc canônico. merge não apaga o roteiro."""

    def _write() -> None:
        _trips_col(owner_uid).document(trip_id).set(
            {"destination_lat": lat, "destination_lng": lng},
            merge=True,
        )

    await run_in_threadpool(_write)


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
            if data.get("deleted_at") is None and not _is_member_pointer(data):
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
        fields = {
            "deleted_at": firestore.SERVER_TIMESTAMP,
            "updated_at": firestore.SERVER_TIMESTAMP,
        }
        ref.update(fields)
        _sync_member_pointers(snap.to_dict() or {}, trip_id, fields)
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
        fields = {
            "deleted_at": None,
            "updated_at": firestore.SERVER_TIMESTAMP,
        }
        ref.update(fields)
        _sync_member_pointers(data, trip_id, fields)
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

        payload = _itinerary_payload(
            data,
            reset_completed=True,
            refresh_ids=True,
        )
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
        try:
            _bump_explore_clone(source_trip_id)
        except Exception:
            logger.warning("explore clone_count: trip_id={}", source_trip_id)
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


class TripAccessError(Exception):
    """UID não é dono nem membro."""


class TripMissingError(Exception):
    """Doc ou índice de share não existe."""


class InviteFullError(Exception):
    """Sala já tem dono + 1. 3+ é Premium futuro."""


class CollabConflict(Exception):
    """Op não comuta. `trip` é o doc atual, sem a op rejeitada."""

    def __init__(self, code: str, trip: SavedTripResponse) -> None:
        self.code = code
        self.trip = trip
        super().__init__(code)


def _sync_member_pointers(
    data: dict[str, Any],
    trip_id: str,
    fields: dict[str, Any],
) -> None:
    """Espelha lixeira/meta no ponteiro do convidado. Sem `days`."""
    owner = str(data.get("owner_uid") or "")
    for member in _member_uids(data):
        if member == owner:
            continue
        ref = _trips_col(member).document(trip_id)
        if ref.get().exists:
            ref.update(fields)


def _grant_presence(trip_id: str, uids: list[str]) -> None:
    """ACL efêmera no Realtime Database. Sem URL configurada, presença fica off."""
    from core.config import settings

    url = (settings.FIREBASE_DATABASE_URL or "").strip()
    if not url:
        return
    try:
        from firebase_admin import db as rtdb

        rtdb.reference(f"presence_acl/{trip_id}", url=url).set(
            {uid: True for uid in uids}
        )
    except Exception:
        logger.warning("Presença indisponível: trip_id={}", trip_id)


def _state_from_doc(data: dict[str, Any]) -> dict[str, Any]:
    payload = _itinerary_payload(data)
    try:
        revision = int(data.get("revision") or 0)
    except (TypeError, ValueError):
        revision = 0
    recent = data.get("recent_op_ids")
    return {
        **payload,
        "revision": revision,
        "recent_op_ids": recent if isinstance(recent, list) else [],
        "last_op_id": data.get("last_op_id"),
        "last_op_type": data.get("last_op_type"),
    }


def _list_fields(state: dict[str, Any]) -> dict[str, Any]:
    days = state.get("days") or []
    return {
        "destination": state.get("destination") or "",
        "title": str(state.get("title") or "").strip(),
        "summary": state.get("summary") or "",
        "start_date": state.get("start_date"),
        "end_date": state.get("end_date"),
        "day_count": len(days) if isinstance(days, list) else 0,
        "updated_at": firestore.SERVER_TIMESTAMP,
    }


async def create_collab_trip(
    owner_uid: str,
    guest_uid: str,
    match_id: str,
    itinerary: dict[str, Any],
) -> str:
    """Uma viagem canônica no dono + ponteiro sem `days` no convidado.

    O ponteiro não entra em `count_active` (`role == member`).
    """

    def _write() -> str:
        payload = _itinerary_payload(itinerary)
        members = [owner_uid]
        if guest_uid and guest_uid != owner_uid:
            members.append(guest_uid)
        new_ref = _trips_col(owner_uid).document()
        trip_id = new_ref.id
        body: dict[str, Any] = {
            **payload,
            "owner_uid": owner_uid,
            "trip_id": trip_id,
            "match_id": match_id,
            "member_uids": members,
            "collab": True,
            "revision": 0,
            "recent_op_ids": [],
            "last_op_id": None,
            "last_op_type": None,
            "deleted_at": None,
            "created_at": firestore.SERVER_TIMESTAMP,
            "updated_at": firestore.SERVER_TIMESTAMP,
        }
        new_ref.set(body)
        _write_share_index(trip_id, owner_uid)
        if guest_uid and guest_uid != owner_uid:
            _trips_col(guest_uid).document(trip_id).set(
                {
                    "owner_uid": owner_uid,
                    "trip_id": trip_id,
                    "role": "member",
                    "collab": True,
                    "match_id": match_id,
                    "member_uids": members,
                    "destination": payload.get("destination") or "",
                    "title": payload.get("title") or "",
                    "summary": payload.get("summary") or "",
                    "start_date": payload.get("start_date"),
                    "end_date": payload.get("end_date"),
                    "day_count": len(payload.get("days") or []),
                    "deleted_at": None,
                    "created_at": firestore.SERVER_TIMESTAMP,
                    "updated_at": firestore.SERVER_TIMESTAMP,
                }
            )
        _grant_presence(trip_id, members)
        logger.info(
            "Trip conjunta criada: owner={} guest={} trip_id={} match_id={}",
            owner_uid,
            guest_uid,
            trip_id,
            match_id,
        )
        return trip_id

    return await run_in_threadpool(_write)


async def apply_trip_op(
    trip_id: str,
    uid: str,
    op: dict[str, Any],
    *,
    editor_name: str = "",
) -> tuple[SavedTripResponse, bool]:
    """Transação: revisão + op. Idempotente se `op_id` já está no doc."""
    name = editor_name.strip()[:80]

    def _run() -> tuple[SavedTripResponse, bool]:
        owner = _resolve_owner(trip_id)
        if not owner:
            raise TripMissingError
        ref = _trips_col(owner).document(trip_id)
        transaction = db.transaction()
        applied_box: dict[str, bool] = {"applied": False}

        @firestore.transactional
        def _txn(transaction: Any) -> dict[str, Any]:
            snap = ref.get(transaction=transaction)
            if not snap.exists:
                raise TripMissingError
            data = snap.to_dict() or {}
            data.setdefault("owner_uid", owner)
            members = _member_uids(data)
            owner_uid = str(data.get("owner_uid") or owner)
            if uid != owner_uid and uid not in members:
                raise TripAccessError
            if not _as_bool(data.get("collab")):
                raise CollabConflict(
                    "not_collab",
                    _doc_to_saved(trip_id, data, viewer_uid=uid),
                )
            state = _state_from_doc(data)
            try:
                new_state, applied = apply_op(state, op)
            except TripOpError as exc:
                raise CollabConflict(
                    exc.code,
                    _doc_to_saved(trip_id, data, viewer_uid=uid),
                ) from exc
            applied_box["applied"] = applied
            if not applied:
                return data
            kind, change_day = describe_change(state, new_state, op)
            change_log = append_change_log(
                data.get("change_log"),
                by=name,
                kind=kind,
                day=change_day,
                at_ms=int(time.time() * 1000),
            )
            data.update(
                {
                    "days": new_state.get("days") or [],
                    "destination": new_state.get("destination") or "",
                    "title": str(new_state.get("title") or "").strip(),
                    "summary": new_state.get("summary") or "",
                    "notes": new_state.get("notes") or "",
                    "tips": new_state.get("tips") or [],
                    "start_date": new_state.get("start_date"),
                    "end_date": new_state.get("end_date"),
                    "revision": new_state.get("revision") or 0,
                    "recent_op_ids": new_state.get("recent_op_ids") or [],
                    "last_op_id": new_state.get("last_op_id"),
                    "last_op_type": new_state.get("last_op_type"),
                    "last_change": kind,
                    "last_change_day": change_day,
                    "change_log": change_log,
                    "updated_by": uid,
                    "updated_by_name": name,
                    "updated_at": firestore.SERVER_TIMESTAMP,
                }
            )
            transaction.update(
                ref,
                {
                    "days": data["days"],
                    "destination": data["destination"],
                    "title": data["title"],
                    "summary": data["summary"],
                    "notes": data["notes"],
                    "tips": data["tips"],
                    "start_date": data["start_date"],
                    "end_date": data["end_date"],
                    "revision": data["revision"],
                    "recent_op_ids": data["recent_op_ids"],
                    "last_op_id": data["last_op_id"],
                    "last_op_type": data["last_op_type"],
                    "last_change": kind,
                    "last_change_day": change_day,
                    "change_log": change_log,
                    "updated_by": uid,
                    "updated_by_name": name,
                    "updated_at": firestore.SERVER_TIMESTAMP,
                },
            )
            if op.get("type") in {"patch_meta", "add_day", "delete_day"}:
                pointer_fields = _list_fields(new_state)
                for member in members:
                    if member == owner_uid:
                        continue
                    transaction.set(
                        _trips_col(member).document(trip_id),
                        pointer_fields,
                        merge=True,
                    )
            return data

        try:
            stored = _txn(transaction)
        except CollabConflict:
            raise
        return _doc_to_saved(trip_id, stored, viewer_uid=uid), applied_box["applied"]

    return await run_in_threadpool(_run)


def _bump_explore_clone(source_trip_id: str) -> None:
    """Contador do feed. Sem cartão, não faz nada. Falha não desfaz o clone."""
    ref = db.collection(_EXPLORE).document(source_trip_id)
    if not ref.get().exists:
        return
    ref.update({"clone_count": firestore.Increment(1)})


def _owned_trip(trip_id: str, uid: str) -> tuple[str, dict[str, Any]]:
    """Doc canônico se `uid` é o dono. Senão TripAccessError / TripMissingError."""
    owner = _resolve_owner(trip_id)
    if owner and owner != uid:
        raise TripAccessError
    if not owner:
        snap = _trips_col(uid).document(trip_id).get()
        if not snap.exists:
            raise TripMissingError
        data = snap.to_dict() or {}
        data.setdefault("owner_uid", uid)
        if data.get("deleted_at") is not None:
            raise TripMissingError
        return uid, data
    snap = _trips_col(owner).document(trip_id).get()
    if not snap.exists:
        raise TripMissingError
    data = snap.to_dict() or {}
    data.setdefault("owner_uid", owner)
    if data.get("deleted_at") is not None:
        raise TripMissingError
    return owner, data


def _day_count_of(data: dict[str, Any]) -> int:
    days = data.get("days")
    if isinstance(days, list) and days:
        return len([day for day in days if isinstance(day, dict)])
    try:
        count = int(data.get("day_count") or 0)
    except (TypeError, ValueError):
        return 0
    return count if count > 0 else 0


def _missing_activity_id(days: Any) -> bool:
    if not isinstance(days, list):
        return False
    for day in days:
        if not isinstance(day, dict):
            continue
        for act in day.get("activities") or []:
            if isinstance(act, dict) and clean_activity_id(act.get("id")) is None:
                return True
    return False


def _pointer_body(
    data: dict[str, Any],
    trip_id: str,
    owner: str,
    members: list[str],
) -> dict[str, Any]:
    """Ponteiro da Home do convidado. Sem `days` — não conta no teto Free."""
    body: dict[str, Any] = {
        "owner_uid": owner,
        "trip_id": trip_id,
        "role": "member",
        "collab": True,
        "member_uids": members,
        "destination": data.get("destination") or "",
        "title": str(data.get("title") or "").strip(),
        "summary": data.get("summary") or "",
        "start_date": data.get("start_date"),
        "end_date": data.get("end_date"),
        "day_count": _day_count_of(data),
        "deleted_at": None,
        "updated_at": firestore.SERVER_TIMESTAMP,
    }
    match_id = data.get("match_id")
    if isinstance(match_id, str) and match_id.strip():
        body["match_id"] = match_id.strip()
    return body


def _invite_expired(data: dict[str, Any]) -> bool:
    expires = _as_datetime(data.get("expires_at"))
    if expires is None:
        return True
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    return expires <= datetime.now(timezone.utc)


async def create_invite(trip_id: str, uid: str) -> tuple[str, datetime]:
    """Rotaciona o convite. Devolve o plaintext uma vez — não entra em log."""

    def _write() -> tuple[str, datetime]:
        token = secrets.token_urlsafe(32)
        digest = invite_doc_id(token)
        expires = datetime.now(timezone.utc) + timedelta(days=_INVITE_DAYS)
        ref = _trips_col(uid).document(trip_id)
        transaction = db.transaction()

        @firestore.transactional
        def _txn(transaction: Any) -> None:
            owner = _resolve_owner(trip_id)
            if owner and owner != uid:
                raise TripAccessError
            snap = ref.get(transaction=transaction)
            if not snap.exists:
                raise TripMissingError
            data = snap.to_dict() or {}
            if data.get("deleted_at") is not None:
                raise TripMissingError
            if owner is None and str(data.get("owner_uid") or uid) != uid:
                raise TripAccessError
            previous = data.get("invite_hash")
            if isinstance(previous, str) and previous and previous != digest:
                transaction.delete(db.collection(_INVITES).document(previous))
            transaction.set(
                db.collection(_INVITES).document(digest),
                {
                    "trip_id": trip_id,
                    "owner_uid": uid,
                    "expires_at": expires,
                    "created_at": firestore.SERVER_TIMESTAMP,
                },
            )
            transaction.update(
                ref,
                {
                    "invite_hash": digest,
                    "updated_at": firestore.SERVER_TIMESTAMP,
                },
            )

        _txn(transaction)
        logger.info("Trip invite criado: uid={} trip_id={}", uid, trip_id)
        return token, expires

    return await run_in_threadpool(_write)


async def read_invite(token: str, viewer_uid: str) -> dict[str, Any] | None:
    """Preview. None = token inválido, vencido ou viagem na lixeira."""

    def _fetch() -> dict[str, Any] | None:
        if not valid_invite_token(token):
            return None
        snap = db.collection(_INVITES).document(invite_doc_id(token)).get()
        if not snap.exists:
            return None
        invite = snap.to_dict() or {}
        if _invite_expired(invite):
            return None
        trip_id = invite.get("trip_id")
        owner = invite.get("owner_uid")
        if not isinstance(trip_id, str) or not isinstance(owner, str):
            return None
        trip_snap = _trips_col(owner).document(trip_id).get()
        if not trip_snap.exists:
            return None
        data = trip_snap.to_dict() or {}
        if data.get("deleted_at") is not None:
            return None
        members = _member_uids(data)
        if owner not in members:
            members = [owner, *members]
        logger.info(
            "Trip invite preview: uid={} trip_id={}",
            viewer_uid,
            trip_id,
        )
        return {
            "trip_id": trip_id,
            "owner_uid": owner,
            "destination": str(data.get("destination") or ""),
            "title": str(data.get("title") or "").strip(),
            "day_count": _day_count_of(data),
            "already_member": viewer_uid == owner or viewer_uid in members,
        }

    return await run_in_threadpool(_fetch)


async def accept_invite(
    trip_id: str,
    uid: str,
    token: str,
) -> SavedTripResponse:
    """Sobe o Solo pra sala e grava o ponteiro. Token não entra em log."""

    def _run() -> SavedTripResponse:
        if not valid_invite_token(token):
            raise TripMissingError
        invite_ref = db.collection(_INVITES).document(invite_doc_id(token))
        outcome = {"code": "owner", "members": [uid]}

        owner = _resolve_owner(trip_id)
        invite_snap = invite_ref.get()
        if not invite_snap.exists:
            raise TripMissingError
        invite = invite_snap.to_dict() or {}
        if invite.get("trip_id") != trip_id or _invite_expired(invite):
            raise TripMissingError
        if not owner:
            raw_owner = invite.get("owner_uid")
            owner = raw_owner if isinstance(raw_owner, str) and raw_owner else None
        if not owner:
            raise TripMissingError

        ref = _trips_col(owner).document(trip_id)
        transaction = db.transaction()

        @firestore.transactional
        def _txn(transaction: Any) -> dict[str, Any]:
            fresh = invite_ref.get(transaction=transaction)
            if not fresh.exists:
                raise TripMissingError
            fresh_invite = fresh.to_dict() or {}
            if fresh_invite.get("trip_id") != trip_id or _invite_expired(fresh_invite):
                raise TripMissingError
            invite_owner = fresh_invite.get("owner_uid")
            if isinstance(invite_owner, str) and invite_owner != owner:
                raise TripMissingError
            snap = ref.get(transaction=transaction)
            if not snap.exists:
                raise TripMissingError
            data = snap.to_dict() or {}
            data.setdefault("owner_uid", owner)
            if data.get("deleted_at") is not None:
                raise TripMissingError
            code, members = decide_join(_member_uids(data), owner, uid)
            outcome["code"] = code
            outcome["members"] = members
            if code == "full":
                raise InviteFullError
            if code == "owner":
                return data
            pointer_ref = _trips_col(uid).document(trip_id)
            # Leitura antes de qualquer write — o Firestore recusa o contrário.
            pointer_exists = pointer_ref.get(transaction=transaction).exists
            try:
                revision = int(data.get("revision") or 0)
            except (TypeError, ValueError):
                revision = 0
            updates: dict[str, Any] = {
                "collab": True,
                "member_uids": members,
                "updated_at": firestore.SERVER_TIMESTAMP,
            }
            if code == "join":
                if data.get("revision") is None:
                    updates["revision"] = revision
                if not isinstance(data.get("recent_op_ids"), list):
                    updates["recent_op_ids"] = []
                if _missing_activity_id(data.get("days")):
                    updates["days"] = stamp_activity_ids(
                        data.get("days") if isinstance(data.get("days"), list) else []
                    )
                    data["days"] = updates["days"]
            data.update(
                {
                    "collab": True,
                    "member_uids": members,
                    "revision": updates.get("revision", data.get("revision") or 0),
                    "recent_op_ids": updates.get(
                        "recent_op_ids",
                        data.get("recent_op_ids") or [],
                    ),
                }
            )
            transaction.update(ref, updates)
            pointer = _pointer_body(data, trip_id, owner, members)
            if not pointer_exists:
                pointer["created_at"] = firestore.SERVER_TIMESTAMP
            transaction.set(pointer_ref, pointer, merge=True)
            return data

        stored = _txn(transaction)
        if outcome["code"] != "owner":
            _grant_presence(trip_id, outcome["members"])
        logger.info(
            "Trip invite accept: uid={} trip_id={} result={}",
            uid,
            trip_id,
            outcome["code"],
        )
        return _doc_to_saved(trip_id, stored, viewer_uid=uid)

    return await run_in_threadpool(_run)


async def set_trip_public(
    trip_id: str,
    uid: str,
    *,
    owner_name: str,
    public: bool,
) -> SavedTripResponse:
    """Liga ou tira o cartão do feed. Não mexe em trip_shares."""

    def _write() -> SavedTripResponse:
        owner, data = _owned_trip(trip_id, uid)
        ref = _trips_col(owner).document(trip_id)
        card = db.collection(_EXPLORE).document(trip_id)
        if public:
            name = owner_name.strip()[:80]
            card_body: dict[str, Any] = {
                "destination": str(data.get("destination") or ""),
                "destination_key": destination_key(str(data.get("destination") or "")),
                "title": str(data.get("title") or "").strip(),
                "summary": str(data.get("summary") or ""),
                "day_count": _day_count_of(data),
                "owner_name": name,
            }
            existing = card.get()
            if existing.exists:
                card.set(card_body, merge=True)
            else:
                card.set(
                    {
                        **card_body,
                        "published_at": firestore.SERVER_TIMESTAMP,
                        "clone_count": 0,
                    }
                )
            fields: dict[str, Any] = {
                "is_public": True,
                "updated_at": firestore.SERVER_TIMESTAMP,
            }
            if data.get("published_at") is None:
                fields["published_at"] = firestore.SERVER_TIMESTAMP
            ref.update(fields)
            data.update({"is_public": True})
        else:
            ref.update(
                {
                    "is_public": False,
                    "published_at": None,
                    "updated_at": firestore.SERVER_TIMESTAMP,
                }
            )
            card.delete()
            data["is_public"] = False
        logger.info(
            "Trip explore: uid={} trip_id={} public={}",
            uid,
            trip_id,
            public,
        )
        return _doc_to_saved(trip_id, data, viewer_uid=uid)

    return await run_in_threadpool(_write)


def _save_doc_id(trip_id: str, uid: str) -> str:
    return f"{trip_id}_{uid}"


async def set_explore_saved(trip_id: str, uid: str, *, saved: bool) -> bool:
    """Coração no cartão público. Sem cartão → TripMissingError."""

    def _write() -> bool:
        card_ref = db.collection(_EXPLORE).document(trip_id)
        save_ref = db.collection(_SAVES).document(_save_doc_id(trip_id, uid))
        week = utc_week_id()
        transaction = db.transaction()

        @firestore.transactional
        def _txn(transaction: Any) -> bool:
            card_snap = card_ref.get(transaction=transaction)
            if not card_snap.exists:
                raise TripMissingError
            save_snap = save_ref.get(transaction=transaction)
            card = card_snap.to_dict() or {}
            already = save_snap.exists
            if saved:
                if already:
                    return True
                transaction.update(card_ref, apply_week_save(card, add=1, week=week))
                transaction.set(
                    save_ref,
                    {
                        "trip_id": trip_id,
                        "uid": uid,
                        "week_id": week,
                        "created_at": firestore.SERVER_TIMESTAMP,
                    },
                )
                return True
            if not already:
                return False
            save_data = save_snap.to_dict() or {}
            save_week = save_data.get("week_id")
            if (
                isinstance(save_week, str)
                and save_week == week
                and card.get("week_id") == week
            ):
                fields = apply_week_save(card, add=-1, week=week)
                if fields:
                    transaction.update(card_ref, fields)
            transaction.delete(save_ref)
            return False

        result = _txn(transaction)
        logger.info(
            "Explore save: uid={} trip_id={} saved={}",
            uid,
            trip_id,
            result,
        )
        return result

    return await run_in_threadpool(_write)
