"""Operações semânticas da edição conjunta.

O roteiro continua um documento. O cliente manda um op (`patch`, `delete`,
`reorder`), não o `days[]` inteiro. Revisão velha só falha quando a op não
comuta — meta contra meta, ou dia renumerado debaixo de um reorder.

ponytail: sem CRDT. Teto = 2 editores e ops que cabem numa transação.
Upgrade = log de ops se um dia precisarmos rebobinar mais de uma revisão.
"""
from __future__ import annotations

import re
import uuid
from copy import deepcopy
from typing import Any

_ID_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")
_RECENT_CAP = 20

_ACTIVITY_FIELDS = frozenset(
    {
        "time",
        "title",
        "description",
        "location",
        "latitude",
        "longitude",
        "requires_ticket",
        "completed",
        "place_id",
    }
)
_META_FIELDS = frozenset(
    {"destination", "title", "summary", "notes", "tips", "start_date", "end_date"}
)
# Ops que deslocam o número do dia. Reorder/add em cima disso não comuta.
_DAY_SHIFT = frozenset({"add_day", "delete_day"})
_DAY_SCOPED = frozenset({"reorder_day", "add_activity", "add_day", "delete_day"})


class TripOpError(Exception):
    """Conflito fechado — o caller devolve 409 e o doc atual."""

    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(code)


def new_activity_id() -> str:
    return uuid.uuid4().hex


def clean_activity_id(value: Any) -> str | None:
    """Id estável curto. Título/índice não entram aqui."""
    if not isinstance(value, str):
        return None
    text = value.strip()
    if not _ID_RE.fullmatch(text):
        return None
    return text


def stamp_activity_ids(days: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Garante `id` em cada parada. Id válido já gravado é preservado."""
    stamped: list[dict[str, Any]] = []
    for day in days:
        if not isinstance(day, dict):
            continue
        acts: list[dict[str, Any]] = []
        for raw in day.get("activities") or []:
            if not isinstance(raw, dict):
                continue
            act = dict(raw)
            act["id"] = clean_activity_id(act.get("id")) or new_activity_id()
            acts.append(act)
        stamped.append({**day, "activities": acts})
    return stamped


def apply_op(state: dict[str, Any], op: dict[str, Any]) -> tuple[dict[str, Any], bool]:
    """Aplica um op. Devolve (estado, escreveu?).

    `escreveu` falso = idempotente (op_id repetido ou alvo já no estado pedido).
    Levanta TripOpError quando a op não pode ser aplicada sem corromper.
    """
    op_id = clean_activity_id(op.get("op_id"))
    if op_id is None:
        raise TripOpError("invalid_op")

    recent = [x for x in (state.get("recent_op_ids") or []) if isinstance(x, str)]
    if op_id in recent:
        return state, False

    try:
        base = int(op.get("base_revision"))
    except (TypeError, ValueError) as exc:
        raise TripOpError("invalid_op") from exc

    revision = int(state.get("revision") or 0)
    stale = base != revision
    typ = str(op.get("type") or "")
    payload = op.get("payload") if isinstance(op.get("payload"), dict) else None
    if payload is None:
        raise TripOpError("invalid_op")

    last_type = state.get("last_op_type")
    if (
        stale
        and last_type in _DAY_SHIFT
        and typ in _DAY_SCOPED
    ):
        # O número do dia mudou desde a base. Rebase cego cairia no dia errado.
        raise TripOpError("revision_conflict")

    if stale and typ == "patch_meta" and last_type == "patch_meta":
        raise TripOpError("revision_conflict")

    next_state = deepcopy(state)
    days: list[dict[str, Any]] = list(next_state.get("days") or [])
    changed = _dispatch(days, next_state, typ, payload)
    if not changed:
        return state, False

    next_state["days"] = days
    next_state["revision"] = revision + 1
    next_state["recent_op_ids"] = (recent + [op_id])[-_RECENT_CAP:]
    next_state["last_op_id"] = op_id
    next_state["last_op_type"] = typ
    return next_state, True


def _dispatch(
    days: list[dict[str, Any]],
    state: dict[str, Any],
    typ: str,
    payload: dict[str, Any],
) -> bool:
    if typ == "patch_activity":
        return _patch_activity(days, payload)
    if typ == "delete_activity":
        return _delete_activity(days, payload)
    if typ == "reorder_day":
        return _reorder_day(days, payload)
    if typ == "patch_meta":
        return _patch_meta(days, state, payload)
    if typ == "add_activity":
        return _add_activity(days, payload)
    if typ == "add_day":
        return _add_day(days, payload)
    if typ == "delete_day":
        return _delete_day(days, payload)
    raise TripOpError("invalid_op")


def _locate(days: list[dict[str, Any]], activity_id: str) -> tuple[int, int] | None:
    for di, day in enumerate(days):
        for ai, act in enumerate(day.get("activities") or []):
            if isinstance(act, dict) and act.get("id") == activity_id:
                return di, ai
    return None


def _day_index(days: list[dict[str, Any]], day_num: int) -> int | None:
    for i, day in enumerate(days):
        try:
            if int(day.get("day") or 0) == day_num:
                return i
        except (TypeError, ValueError):
            continue
    return None


def _patch_activity(days: list[dict[str, Any]], payload: dict[str, Any]) -> bool:
    activity_id = clean_activity_id(payload.get("activity_id"))
    if activity_id is None:
        raise TripOpError("invalid_op")
    found = _locate(days, activity_id)
    if found is None:
        raise TripOpError("activity_deleted")
    di, ai = found
    act = dict(days[di]["activities"][ai])
    fields = payload.get("fields") if isinstance(payload.get("fields"), dict) else {}
    for key, value in fields.items():
        if key in _ACTIVITY_FIELDS:
            act[key] = _clean_activity_value(key, value)
    days[di]["activities"][ai] = act

    to_day = payload.get("to_day")
    if to_day is None:
        return True
    try:
        target_num = int(to_day)
    except (TypeError, ValueError) as exc:
        raise TripOpError("invalid_op") from exc
    target = _day_index(days, target_num)
    if target is None:
        raise TripOpError("day_missing")
    if target == di:
        return True
    moved = days[di]["activities"].pop(ai)
    days[target].setdefault("activities", []).append(moved)
    return True


def _delete_activity(days: list[dict[str, Any]], payload: dict[str, Any]) -> bool:
    activity_id = clean_activity_id(payload.get("activity_id"))
    if activity_id is None:
        raise TripOpError("invalid_op")
    found = _locate(days, activity_id)
    if found is None:
        # O outro já apagou — a intenção é a mesma. Sem ressuscitar.
        return False
    di, ai = found
    activities = days[di].get("activities") or []
    if len(activities) <= 1:
        raise TripOpError("last_activity")
    activities.pop(ai)
    days[di]["activities"] = activities
    return True


def _reorder_day(days: list[dict[str, Any]], payload: dict[str, Any]) -> bool:
    try:
        day_num = int(payload.get("day"))
    except (TypeError, ValueError) as exc:
        raise TripOpError("invalid_op") from exc
    di = _day_index(days, day_num)
    if di is None:
        raise TripOpError("day_missing")

    raw_ids = payload.get("activity_ids")
    if not isinstance(raw_ids, list):
        raise TripOpError("invalid_op")
    by_id = {
        act["id"]: act
        for act in (days[di].get("activities") or [])
        if isinstance(act, dict) and clean_activity_id(act.get("id"))
    }
    server_ids = list(by_id)
    client_ids = [
        cid
        for raw in raw_ids
        if (cid := clean_activity_id(raw)) is not None and cid in by_id
    ]
    merged = _insert_preserved(client_ids, server_ids)
    times = payload.get("times") if isinstance(payload.get("times"), dict) else {}
    ordered: list[dict[str, Any]] = []
    for activity_id in merged:
        act = dict(by_id[activity_id])
        # Horário novo só nos ids que o cliente ainda enxergava.
        # Id preservado (o outro acrescentou) fica com o horário dele.
        if activity_id in client_ids and activity_id in times:
            act["time"] = str(times[activity_id] or "")
        ordered.append(act)
    days[di]["activities"] = ordered
    return True


def _insert_preserved(client_ids: list[str], server_ids: list[str]) -> list[str]:
    """Ordem do cliente + ids que só o servidor tem, na posição relativa antiga."""
    result = list(client_ids)
    for index, activity_id in enumerate(server_ids):
        if activity_id in result:
            continue
        placed = False
        for prev in reversed(server_ids[:index]):
            if prev in result:
                result.insert(result.index(prev) + 1, activity_id)
                placed = True
                break
        if not placed:
            result.insert(0, activity_id)
    return result


def _patch_meta(
    days: list[dict[str, Any]],
    state: dict[str, Any],
    payload: dict[str, Any],
) -> bool:
    changed = False
    for key in _META_FIELDS:
        if key not in payload:
            continue
        state[key] = _clean_meta_value(key, payload.get(key))
        changed = True
    titles = payload.get("day_titles")
    if isinstance(titles, list):
        for item in titles:
            if not isinstance(item, dict):
                continue
            try:
                day_num = int(item.get("day"))
            except (TypeError, ValueError):
                continue
            di = _day_index(days, day_num)
            if di is None:
                # Dia sumiu no meio do caminho — não recria.
                continue
            days[di]["title"] = str(item.get("title") or "")
            changed = True
    if not changed:
        raise TripOpError("invalid_op")
    return True


def _add_activity(days: list[dict[str, Any]], payload: dict[str, Any]) -> bool:
    try:
        day_num = int(payload.get("day"))
    except (TypeError, ValueError) as exc:
        raise TripOpError("invalid_op") from exc
    di = _day_index(days, day_num)
    if di is None:
        raise TripOpError("day_missing")
    raw = payload.get("activity")
    if not isinstance(raw, dict):
        raise TripOpError("invalid_op")
    activity_id = clean_activity_id(raw.get("id"))
    if activity_id is None:
        raise TripOpError("invalid_op")
    if _locate(days, activity_id) is not None:
        return False
    act = {
        "id": activity_id,
        "time": str(raw.get("time") or ""),
        "title": str(raw.get("title") or ""),
        "description": str(raw.get("description") or ""),
        "location": str(raw.get("location") or ""),
        "latitude": raw.get("latitude"),
        "longitude": raw.get("longitude"),
        "requires_ticket": bool(raw.get("requires_ticket")),
        "completed": bool(raw.get("completed")),
        "place_id": raw.get("place_id") if isinstance(raw.get("place_id"), str) else None,
    }
    activities = list(days[di].get("activities") or [])
    try:
        index = int(payload.get("index"))
    except (TypeError, ValueError):
        index = len(activities)
    index = max(0, min(index, len(activities)))
    activities.insert(index, act)
    days[di]["activities"] = activities
    return True


def _add_day(days: list[dict[str, Any]], payload: dict[str, Any]) -> bool:
    try:
        day_num = int(payload.get("day"))
    except (TypeError, ValueError) as exc:
        raise TripOpError("invalid_op") from exc
    if _day_index(days, day_num) is not None:
        raise TripOpError("day_conflict")
    days.append(
        {
            "day": day_num,
            "title": str(payload.get("title") or ""),
            "activities": [],
        }
    )
    return True


def _delete_day(days: list[dict[str, Any]], payload: dict[str, Any]) -> bool:
    try:
        day_num = int(payload.get("day"))
    except (TypeError, ValueError) as exc:
        raise TripOpError("invalid_op") from exc
    di = _day_index(days, day_num)
    if di is None:
        return False
    if len(days) <= 1:
        raise TripOpError("last_day")
    days.pop(di)
    for i, day in enumerate(days):
        day["day"] = i + 1
    return True


def _clean_activity_value(key: str, value: Any) -> Any:
    if key in {"requires_ticket", "completed"}:
        return bool(value)
    if key in {"latitude", "longitude"}:
        if value is None or value == "":
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            return None
    if key == "place_id":
        if not isinstance(value, str):
            return None
        text = value.strip()
        return text if len(text) >= 10 else None
    return str(value or "")


def _clean_meta_value(key: str, value: Any) -> Any:
    if key == "tips":
        if not isinstance(value, list):
            return []
        return [str(t).strip() for t in value if isinstance(t, str) and str(t).strip()]
    if key in {"start_date", "end_date"}:
        if value is None or value == "":
            return None
        return str(value)[:10]
    return str(value or "")


def describe_change(
    before: dict[str, Any],
    after: dict[str, Any],
    op: dict[str, Any],
) -> tuple[str, int | None]:
    """Rótulo curto da op, pra UI avisar quem mudou o quê. Sem frase pronta."""
    typ = str(op.get("type") or "")
    payload = op.get("payload") if isinstance(op.get("payload"), dict) else {}
    day = _payload_day(payload)

    if typ == "reorder_day":
        return "reorder", day
    if typ == "delete_activity":
        return "delete_activity", None
    if typ == "patch_activity":
        return "patch_activity", None
    if typ == "add_activity":
        return "add_activity", day
    if typ == "add_day":
        return "add_day", day
    if typ == "delete_day":
        return "delete_day", day
    if typ == "patch_meta":
        return _describe_meta(before, after)
    return "meta", None


def _payload_day(payload: dict[str, Any]) -> int | None:
    try:
        day = int(payload.get("day"))
    except (TypeError, ValueError):
        return None
    return day if day >= 1 else None


def _describe_meta(
    before: dict[str, Any],
    after: dict[str, Any],
) -> tuple[str, int | None]:
    changed: list[tuple[str, int | None]] = []
    if str(before.get("title") or "") != str(after.get("title") or ""):
        changed.append(("title", None))
    if str(before.get("notes") or "") != str(after.get("notes") or ""):
        changed.append(("notes", None))
    if str(before.get("summary") or "") != str(after.get("summary") or ""):
        changed.append(("summary", None))
    before_days = _day_title_map(before)
    after_days = _day_title_map(after)
    for day_num in sorted(set(before_days) | set(after_days)):
        if before_days.get(day_num) != after_days.get(day_num):
            changed.append(("day_title", day_num))
            break
    if len(changed) == 1:
        return changed[0]
    return "meta", None


def _day_title_map(state: dict[str, Any]) -> dict[int, str]:
    titles: dict[int, str] = {}
    for day in state.get("days") or []:
        if not isinstance(day, dict):
            continue
        try:
            number = int(day.get("day") or 0)
        except (TypeError, ValueError):
            continue
        if number >= 1:
            titles[number] = str(day.get("title") or "")
    return titles
