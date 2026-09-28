"""
Regras puras do tick de push. Sem Firestore e sem HTTP.

O horário da parada é a string `09:00` no relógio do aparelho — o mesmo
número que a tela mostra. O fuso vem do device, não do GPS.
"""

from __future__ import annotations

import hmac
import re
import unicodedata
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from urllib.parse import urlencode
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from models.trip import SavedTripResponse

TICK_MINUTES = 15
MAX_LOOKBACK_MINUTES = 45
REMINDER_BEFORE = timedelta(minutes=30)
REVIEW_AFTER = timedelta(hours=2)
WEATHER_HOUR = 7
RAIN_THRESHOLD = 60
# ponytail: substring no título. "parque" pega "Aparque". Upgrade = lista fechada de tipos.
_OUTDOOR = ("praia", "mirante", "trilha", "parque", "praca")
_TIME_RE = re.compile(r"^(\d{1,2}):(\d{2})$")


@dataclass(frozen=True)
class Notice:
    kind: str
    dedupe_id: str
    title: str
    body: str
    url: str


def cron_secret_matches(provided: str | None, expected: str) -> bool:
    """Fail closed: segredo vazio no ambiente não libera o tick."""
    if not expected or not provided:
        return False
    return hmac.compare_digest(provided, expected)


def clamp_lookback(elapsed_minutes: float | None) -> int:
    """15 min no ritmo. Atraso vira no máximo 45 — sem despejar o dia anterior."""
    if elapsed_minutes is None or elapsed_minutes <= TICK_MINUTES:
        return TICK_MINUTES
    return min(int(elapsed_minutes) + 1, MAX_LOOKBACK_MINUTES)


def zone_for(name: str) -> ZoneInfo | None:
    try:
        return ZoneInfo(name.strip())
    except ZoneInfoNotFoundError:
        return None


def parse_hhmm(value: str) -> tuple[int, int] | None:
    match = _TIME_RE.fullmatch(value.strip())
    if match is None:
        return None
    hour, minute = int(match.group(1)), int(match.group(2))
    if hour > 23 or minute > 59:
        return None
    return hour, minute


def is_outdoor(title: str) -> bool:
    folded = unicodedata.normalize("NFD", title.casefold())
    plain = "".join(
        char for char in folded if unicodedata.category(char) != "Mn"
    )
    return any(word in plain for word in _OUTDOOR)


def _in_window(moment: datetime, start: datetime, end: datetime) -> bool:
    return start < moment <= end


def _activity_at(
    start_date: date,
    day: int,
    hour: int,
    minute: int,
    zone: ZoneInfo,
) -> datetime:
    day_date = start_date + timedelta(days=max(day, 1) - 1)
    return datetime(
        day_date.year,
        day_date.month,
        day_date.day,
        hour,
        minute,
        tzinfo=zone,
    )


def _dedupe_id(
    uid: str,
    trip_id: str,
    activity_id: str,
    kind: str,
    local_date: date,
    tz_name: str,
) -> str:
    raw = f"{uid}:{trip_id}:{activity_id}:{kind}:{local_date.isoformat()}:{tz_name}"
    return raw.replace("/", "_")


def _trip_url(trip_id: str, **params: str) -> str:
    query = {"tripId": trip_id}
    for key, value in params.items():
        if value:
            query[key] = value
    return "/trip-detail?" + urlencode(query)


def _label(title: str) -> str:
    cleaned = title.strip()
    return cleaned or "Parada"


def weather_due(tz_name: str, now_utc: datetime, lookback_minutes: int) -> bool:
    zone = zone_for(tz_name)
    if zone is None:
        return False
    local_now = now_utc.astimezone(zone)
    fire_at = datetime(
        local_now.year,
        local_now.month,
        local_now.day,
        WEATHER_HOUR,
        0,
        tzinfo=zone,
    )
    start = local_now - timedelta(minutes=lookback_minutes)
    return _in_window(fire_at, start, local_now)


def plan_trip_notices(
    trip: SavedTripResponse,
    *,
    uid: str,
    tz_name: str,
    now_utc: datetime,
    lookback_minutes: int,
    rain_by_hour: dict[int, int] | None,
) -> list[Notice]:
    """Lembrete, avaliação e no máximo um aviso de chuva para este fuso."""
    zone = zone_for(tz_name)
    if zone is None or trip.start_date is None or trip.end_date is None:
        return []
    if trip.deleted_at is not None:
        return []

    local_now = now_utc.astimezone(zone)
    window_start = local_now - timedelta(minutes=lookback_minutes)
    today = local_now.date()
    if trip.start_date > today + timedelta(days=1) or trip.end_date < today - timedelta(
        days=1
    ):
        return []

    notices: list[Notice] = []
    for day in trip.days:
        for index, activity in enumerate(day.activities):
            parsed = parse_hhmm(activity.time)
            if parsed is None:
                continue
            hour, minute = parsed
            moment = _activity_at(trip.start_date, day.day, hour, minute, zone)
            activity_id = activity.id.strip() or f"d{day.day}-{index}"
            label = _label(activity.title)

            reminder_at = moment - REMINDER_BEFORE
            if _in_window(reminder_at, window_start, local_now):
                notices.append(
                    Notice(
                        kind="reminder",
                        dedupe_id=_dedupe_id(
                            uid,
                            trip.id,
                            activity_id,
                            "reminder",
                            reminder_at.date(),
                            tz_name,
                        ),
                        title=label,
                        body=f"{trip.destination} · {activity.time.strip()}",
                        url=_trip_url(trip.id, day=str(day.day)),
                    )
                )

            place_id = (activity.place_id or "").strip()
            review_at = moment + REVIEW_AFTER
            if (
                activity.completed
                and len(place_id) >= 10
                and _in_window(review_at, window_start, local_now)
            ):
                notices.append(
                    Notice(
                        kind="review",
                        dedupe_id=_dedupe_id(
                            uid,
                            trip.id,
                            activity_id,
                            "review",
                            review_at.date(),
                            tz_name,
                        ),
                        title=label,
                        body=f"Como foi no {label}? Deixa uma nota.",
                        url=_trip_url(
                            trip.id,
                            day=str(day.day),
                            activityId=activity.id.strip(),
                            placeId=place_id,
                            sheet="community",
                        ),
                    )
                )

    if rain_by_hour is not None and trip.start_date <= today <= trip.end_date:
        fire_at = datetime(
            today.year, today.month, today.day, WEATHER_HOUR, 0, tzinfo=zone
        )
        if _in_window(fire_at, window_start, local_now):
            weather = _weather_notice(
                trip,
                uid=uid,
                tz_name=tz_name,
                today=today,
                rain_by_hour=rain_by_hour,
            )
            if weather is not None:
                notices.append(weather)
    return notices


def _weather_notice(
    trip: SavedTripResponse,
    *,
    uid: str,
    tz_name: str,
    today: date,
    rain_by_hour: dict[int, int],
) -> Notice | None:
    day_index = (today - trip.start_date).days + 1 if trip.start_date else 0
    for day in trip.days:
        if day.day != day_index:
            continue
        for activity in day.activities:
            parsed = parse_hhmm(activity.time)
            if parsed is None or not is_outdoor(activity.title):
                continue
            probability = rain_by_hour.get(parsed[0], 0)
            if probability < RAIN_THRESHOLD:
                continue
            label = _label(activity.title)
            return Notice(
                kind="weather",
                dedupe_id=_dedupe_id(
                    uid, trip.id, f"day-{day.day}", "weather", today, tz_name
                ),
                title="Chuva no roteiro",
                body=(
                    f"Chuva prevista no {label} às {activity.time.strip()}. "
                    "Abre o dia e troca por um museu ou café."
                ),
                url=_trip_url(trip.id, day=str(day.day)),
            )
    return None


def support_notice() -> tuple[str, str, str]:
    return (
        "Tripfy",
        "Precisa de ajuda com a viagem? Fale conosco.",
        "/help-support",
    )
