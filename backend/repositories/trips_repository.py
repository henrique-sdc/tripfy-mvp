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
    PersistedActivity,
    PersistedDay,
    SavedTripResponse,
)
from services.trip_ops import (
    TripOpError,
    apply_op,
    clean_activity_id,
    describe_change,
    stamp_activity_ids,
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
        role=role,
        day_count=day_count,
        destination_lat=_as_coord(data.get("destination_lat")),
        destination_lng=_as_coord(data.get("destination_lng")),
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
