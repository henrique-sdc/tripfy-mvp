"""
Registro de token e o tick que decide o que enviar.

A Expo entrega no APNs e no FCM. Um payload, as duas lojas.
"""

from __future__ import annotations

import re
from collections import defaultdict
from datetime import UTC, date, datetime

import httpx
from fastapi import HTTPException, status
from loguru import logger

from core.config import settings
from models.trip import SavedTripResponse
from models.user import PushDevice, PushPlatform, UserInDB
from repositories import notification_repository, trips_repository, user_repository
from services.notification_rules import (
    plan_trip_notices,
    support_notice,
    weather_due,
    zone_for,
)

_TOKEN_RE = re.compile(r"^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$")
_EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
_GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"
_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"


def _valid_token(token: str) -> bool:
    return _TOKEN_RE.fullmatch(token) is not None


async def register_push_token(
    uid: str,
    token: str,
    platform: PushPlatform,
    timezone: str,
) -> None:
    cleaned = token.strip()
    zone_name = timezone.strip()
    if not _valid_token(cleaned) or zone_for(zone_name) is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token ou fuso inválido.",
        )
    user = await user_repository.get_user(uid)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuário não encontrado.",
        )
    device = PushDevice(
        token=cleaned,
        platform=platform,
        timezone=zone_name,
        updated_at=datetime.now(UTC),
    )
    try:
        await notification_repository.upsert_push_device(uid, device)
    except LookupError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuário não encontrado.",
        ) from exc


async def unregister_push_token(uid: str, token: str) -> None:
    cleaned = token.strip()
    if not cleaned:
        return
    await notification_repository.remove_push_device(uid, cleaned)


async def run_tick() -> dict[str, int]:
    now = datetime.now(UTC)
    lookback = await notification_repository.lookback_minutes(now)
    users = await notification_repository.list_enabled_users()
    sent = 0
    forecast_cache: dict[tuple, dict[int, int] | None] = {}
    for user in users:
        if not user.notifications_enabled or not user.push_devices:
            continue
        try:
            sent += await _tick_user(user, now, lookback, forecast_cache)
        except Exception:
            logger.exception("Tick de notificações falhou: uid={}", user.uid)
    await notification_repository.mark_tick(now)
    logger.info("Tick de notificações: users={} sent={}", len(users), sent)
    return {"users": len(users), "sent": sent}


async def send_support_ping(uid: str) -> int:
    """Mesmo envio das regras, com URL fixa de suporte. Sem dedupe."""
    user = await user_repository.get_user(uid)
    if user is None or not user.notifications_enabled or not user.push_devices:
        return 0
    title, body, url = support_notice()
    tokens = [device.token for device in user.push_devices]
    dead, failed = await _push(tokens, title, body, url)
    for token in dead:
        await notification_repository.remove_push_device(uid, token)
    delivered = len(tokens) - len(dead) - len(failed)
    logger.info("Push de suporte: uid={} sent={}", uid, delivered)
    return max(delivered, 0)


async def _tick_user(
    user: UserInDB,
    now: datetime,
    lookback: int,
    forecast_cache: dict[tuple, dict[int, int] | None],
) -> int:
    trips = await _canonical_trips(user.uid)
    by_zone: dict[str, list[PushDevice]] = defaultdict(list)
    for device in user.push_devices:
        by_zone[device.timezone].append(device)

    sent = 0
    for tz_name, devices in by_zone.items():
        if zone_for(tz_name) is None:
            continue
        tokens = [device.token for device in devices]
        for trip in trips:
            rain: dict[int, int] | None = None
            if weather_due(tz_name, now, lookback):
                rain = await _rain_hours(trip, tz_name, now, forecast_cache)
            notices = plan_trip_notices(
                trip,
                uid=user.uid,
                tz_name=tz_name,
                now_utc=now,
                lookback_minutes=lookback,
                rain_by_hour=rain,
            )
            for notice in notices:
                if not await notification_repository.claim_send(notice.dedupe_id):
                    continue
                dead, failed = await _push(tokens, notice.title, notice.body, notice.url)
                for token in dead:
                    await notification_repository.remove_push_device(user.uid, token)
                delivered = len(tokens) - len(dead) - len(failed)
                if delivered <= 0:
                    if len(failed) == len(tokens):
                        await notification_repository.release_send(notice.dedupe_id)
                    continue
                sent += delivered
                logger.info(
                    "Push contextual: uid={} kind={} trip_id={}",
                    user.uid,
                    notice.kind,
                    trip.id,
                )
    return sent


async def _canonical_trips(uid: str) -> list[SavedTripResponse]:
    """Ponteiro do convidado não tem `days`. A regra lê o doc do dono."""
    listed = await trips_repository.list_active(uid)
    trips: list[SavedTripResponse] = []
    seen: set[str] = set()
    for trip in listed:
        if trip.deleted_at is not None:
            continue
        if trip.role == "member":
            full = await trips_repository.get_trip(trip.id, uid)
            if full is None or full.deleted_at is not None or not full.days:
                continue
            trip = full
        if trip.id in seen:
            continue
        seen.add(trip.id)
        trips.append(trip)
    return trips


def _activity_coords(trip: SavedTripResponse) -> tuple[float, float] | None:
    for day in trip.days:
        for activity in day.activities:
            if activity.latitude is not None and activity.longitude is not None:
                return activity.latitude, activity.longitude
    if trip.destination_lat is not None and trip.destination_lng is not None:
        return trip.destination_lat, trip.destination_lng
    return None


async def _rain_hours(
    trip: SavedTripResponse,
    tz_name: str,
    now: datetime,
    cache: dict[tuple, dict[int, int] | None],
) -> dict[int, int] | None:
    """None = falha de rede (o tick seguinte tenta). {} = sem sinal de chuva."""
    zone = zone_for(tz_name)
    if zone is None or trip.start_date is None:
        return {}
    today = now.astimezone(zone).date()
    if not (trip.start_date <= today <= (trip.end_date or today)):
        return {}

    coords = _activity_coords(trip)
    if coords is None:
        coords = await _geocode(trip.destination)
        if coords is not None and trip.owner_uid:
            await trips_repository.cache_destination_coords(
                trip.owner_uid, trip.id, coords[0], coords[1]
            )
    if coords is None:
        return {}

    key = (round(coords[0], 2), round(coords[1], 2), today.isoformat(), tz_name)
    if key in cache:
        return cache[key]
    hours = await _forecast(coords[0], coords[1], today, tz_name)
    cache[key] = hours
    return hours


async def _geocode(name: str) -> tuple[float, float] | None:
    query = name.strip()
    if len(query) < 2:
        return None
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            response = await client.get(
                _GEOCODE_URL,
                params={"name": query[:120], "count": 1, "language": "pt"},
            )
        response.raise_for_status()
        results = response.json().get("results") or []
    except Exception:
        logger.warning("Geocoding do destino falhou")
        return None
    if not results:
        return None
    first = results[0]
    lat, lng = first.get("latitude"), first.get("longitude")
    if not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)):
        return None
    return float(lat), float(lng)


async def _forecast(
    lat: float,
    lng: float,
    day: date,
    tz_name: str,
) -> dict[int, int] | None:
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            response = await client.get(
                _FORECAST_URL,
                params={
                    "latitude": lat,
                    "longitude": lng,
                    "hourly": "precipitation_probability",
                    "timezone": tz_name,
                    "start_date": day.isoformat(),
                    "end_date": day.isoformat(),
                },
            )
        response.raise_for_status()
        hourly = response.json().get("hourly") or {}
        times = hourly.get("time") or []
        probs = hourly.get("precipitation_probability") or []
    except Exception:
        logger.warning("Previsão do Open-Meteo falhou")
        return None
    hours: dict[int, int] = {}
    for stamp, probability in zip(times, probs, strict=False):
        if not isinstance(stamp, str) or not isinstance(probability, (int, float)):
            continue
        # "2026-09-27T14:00" no fuso pedido.
        hour_text = stamp[11:13]
        if hour_text.isdigit():
            hours[int(hour_text)] = int(probability)
    return hours


async def _push(
    tokens: list[str],
    title: str,
    body: str,
    url: str,
) -> tuple[list[str], list[str]]:
    """Devolve (tokens mortos, tokens com falha transitória)."""
    if not tokens:
        return [], []
    messages = [
        {
            "to": token,
            "title": title,
            "body": body,
            "data": {"url": url},
            "sound": "default",
            "channelId": "roteiro",
            "priority": "high",
        }
        for token in tokens
    ]
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    access = settings.EXPO_ACCESS_TOKEN.strip()
    if access:
        headers["Authorization"] = f"Bearer {access}"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(_EXPO_PUSH_URL, json=messages, headers=headers)
        if response.status_code >= 500:
            return [], list(tokens)
        payload = response.json().get("data")
    except Exception:
        logger.warning("Expo Push indisponível")
        return [], list(tokens)

    if not isinstance(payload, list):
        return [], list(tokens)

    dead: list[str] = []
    failed: list[str] = []
    answered: 0
    for token, ticket in zip(tokens, payload, strict=False):
        answered += 1
        if not isinstance(ticket, dict) or ticket.get("status") == "ok":
            continue
        details = ticket.get("details")
        error = details.get("error") if isinstance(details, dict) else None
        if error == "DeviceNotRegistered":
            dead.append(token)
        else:
            failed.append(token)
    if answered < len(tokens):
        failed.extend(tokens[answered:])
    return dead, failed
