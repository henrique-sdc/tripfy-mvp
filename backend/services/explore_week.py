"""Semana UTC do ranking Explorar. O app usa a mesma conta (ISO, UTC)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


def utc_week_id(moment: datetime | None = None) -> str:
    """ISO week em UTC, ex.: 2020-W53."""
    now = moment or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    else:
        now = now.astimezone(timezone.utc)
    year, week, _day = now.isocalendar()
    return f"{year}-W{week:02d}"


def apply_week_save(card: dict[str, Any], *, add: int, week: str) -> dict[str, Any]:
    """Novo `week_id` zera o contador. `add` é +1 ou -1. Semana alheia no unsave não mexe."""
    current = card.get("week_id") if isinstance(card.get("week_id"), str) else ""
    try:
        count = int(card.get("week_saves") or 0)
    except (TypeError, ValueError):
        count = 0
    if add > 0:
        if current != week:
            return {"week_id": week, "week_saves": 1}
        return {"week_id": week, "week_saves": count + 1}
    if current != week:
        return {}
    return {"week_id": week, "week_saves": max(0, count - 1)}
