"""Janela e hash das 3 cidades. Sem I/O."""

from __future__ import annotations

import hashlib
import json
from datetime import date, timedelta

from models.user import TravelPreferences

VIBE_PICK_COUNT = 3
VIBE_TRIP_DAYS = 4


def prefs_key(preferences: TravelPreferences) -> str:
    """Muda quando a vibe muda. O LLM não roda de novo à toa."""
    payload = json.dumps(
        preferences.model_dump(mode="json"),
        sort_keys=True,
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def next_monday(day: date) -> date:
    """Segunda estritamente depois de `day`. Se hoje é segunda, é a da outra semana."""
    ahead = (7 - day.weekday()) % 7
    if ahead == 0:
        ahead = 7
    return day + timedelta(days=ahead)


def four_day_window(day: date) -> tuple[date, date]:
    """4 dias inclusivos a partir da próxima segunda."""
    start = next_monday(day)
    return start, start + timedelta(days=VIBE_TRIP_DAYS - 1)
