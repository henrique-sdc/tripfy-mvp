"""
Proxy da Routes API — tempo e distância reais entre paradas (RF06.1).

Uma chamada computeRoutes cobre o dia (WALK/DRIVE com intermediates).
TRANSIT não aceita intermediates: um computeRoutes por perna, ainda
num único POST do app.

ponytail: cache em memória do processo, TTL 12 h, teto 4000 pernas.
Um worker só. Upgrade = Redis se houver mais de um processo.
"""
from __future__ import annotations

import asyncio
import math
import time
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
from fastapi import HTTPException, status
from loguru import logger

from core.config import settings
from models.routes import (
    CalculateRoutesRequest,
    CalculateRoutesResponse,
    RouteLeg,
    RouteStop,
)
from models.user import TransportMode

_COMPUTE_URL = "https://routes.googleapis.com/directions/v2:computeRoutes"
_DIRECTIONS_URL = "https://maps.googleapis.com/maps/api/directions/json"
_FIELD_MASK = "routes.legs.distanceMeters,routes.legs.duration"
_SHORT_METERS = 40.0
_TTL_S = 12 * 60 * 60
_CACHE_CAP = 4000

# m/s só para o atalho < 40 m — não substitui a Routes API.
_SPEED_MPS: dict[TransportMode, float] = {
    TransportMode.WALKING: 1.4,
    TransportMode.PUBLIC_TRANSIT: 4.0,
    TransportMode.RIDE_HAIL: 8.0,
}
_GOOGLE_MODE: dict[TransportMode, str] = {
    TransportMode.WALKING: "WALK",
    TransportMode.PUBLIC_TRANSIT: "TRANSIT",
    TransportMode.RIDE_HAIL: "DRIVE",
}
_LEGACY_MODE: dict[TransportMode, str] = {
    TransportMode.WALKING: "walking",
    TransportMode.PUBLIC_TRANSIT: "transit",
    TransportMode.RIDE_HAIL: "driving",
}

# chave → (expira em monotonic, perna)
_cache: dict[str, tuple[float, RouteLeg]] = {}


def clear_route_cache() -> None:
    """Testes. Produção deixa o TTL expirar."""
    _cache.clear()


def _require_api_key() -> str:
    api_key = settings.GOOGLE_MAPS_API_KEY.strip()
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Serviço de rotas temporariamente indisponível.",
        )
    return api_key


def _round_coord(value: float) -> str:
    return f"{value:.5f}"


def leg_cache_key(mode: TransportMode, origin: RouteStop, dest: RouteStop) -> str:
    return (
        f"{mode.value}|{_round_coord(origin.latitude)}|{_round_coord(origin.longitude)}"
        f"|{_round_coord(dest.latitude)}|{_round_coord(dest.longitude)}"
    )


def haversine_meters(
    lat1: float, lng1: float, lat2: float, lng2: float
) -> float:
    radius = 6_371_000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lmb = math.radians(lng2 - lng1)
    h = (
        math.sin(d_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(d_lmb / 2) ** 2
    )
    return 2 * radius * math.asin(math.sqrt(h))


def parse_duration_seconds(raw: Any) -> int:
    """Routes devolve duration como '900s' (protobuf JSON)."""
    if isinstance(raw, (int, float)) and not isinstance(raw, bool):
        return max(0, int(raw))
    if isinstance(raw, str) and raw.endswith("s"):
        try:
            return max(0, int(float(raw[:-1])))
        except ValueError:
            return -1
    return -1


def parse_compute_routes(payload: dict[str, Any], expected: int) -> list[RouteLeg]:
    """Extrai pernas. Quantidade diferente da cadeia → 502 (não alinha a UI)."""
    routes = payload.get("routes")
    if not isinstance(routes, list) or not routes or not isinstance(routes[0], dict):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Falha ao consultar rotas.",
        )
    raw_legs = routes[0].get("legs")
    if not isinstance(raw_legs, list) or len(raw_legs) != expected:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Falha ao consultar rotas.",
        )
    legs: list[RouteLeg] = []
    for raw in raw_legs:
        if not isinstance(raw, dict):
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Falha ao consultar rotas.",
            )
        seconds = parse_duration_seconds(raw.get("duration"))
        meters = raw.get("distanceMeters", 0)
        if seconds < 0 or isinstance(meters, bool) or not isinstance(meters, (int, float)):
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Falha ao consultar rotas.",
            )
        legs.append(
            RouteLeg(distance_meters=max(0, int(meters)), duration_seconds=seconds)
        )
    return legs


def _short_leg(origin: RouteStop, dest: RouteStop, mode: TransportMode) -> RouteLeg | None:
    """Menos de 40 m: haversine, sem HTTP. None se vale a pena chamar o Google."""
    meters = haversine_meters(
        origin.latitude, origin.longitude, dest.latitude, dest.longitude
    )
    if meters >= _SHORT_METERS:
        return None
    speed = _SPEED_MPS[mode]
    seconds = 60 if meters <= 0 else max(60, int(round(meters / speed)))
    return RouteLeg(distance_meters=int(round(meters)), duration_seconds=seconds)


def _cache_get(key: str) -> RouteLeg | None:
    hit = _cache.get(key)
    if hit is None:
        return None
    expires, leg = hit
    if expires <= time.monotonic():
        _cache.pop(key, None)
        return None
    return leg


def _cache_put(key: str, leg: RouteLeg) -> None:
    if len(_cache) >= _CACHE_CAP:
        now = time.monotonic()
        stale = [k for k, (exp, _) in _cache.items() if exp <= now]
        for key_stale in stale:
            _cache.pop(key_stale, None)
        if len(_cache) >= _CACHE_CAP:
            _cache.clear()
    _cache[key] = (time.monotonic() + _TTL_S, leg)


def _waypoint(stop: RouteStop) -> dict[str, Any]:
    return {
        "location": {
            "latLng": {
                "latitude": stop.latitude,
                "longitude": stop.longitude,
            }
        }
    }


def build_compute_body(stops: list[RouteStop], mode: TransportMode) -> dict[str, Any]:
    """Corpo computeRoutes. routingPreference só no carro — WALK/TRANSIT rejeitam."""
    body: dict[str, Any] = {
        "origin": _waypoint(stops[0]),
        "destination": _waypoint(stops[-1]),
        "travelMode": _GOOGLE_MODE[mode],
    }
    if len(stops) > 2:
        body["intermediates"] = [_waypoint(stop) for stop in stops[1:-1]]
    if mode == TransportMode.RIDE_HAIL:
        body["routingPreference"] = "TRAFFIC_UNAWARE"
    if mode == TransportMode.PUBLIC_TRANSIT:
        # TRANSIT exige partida. Um minuto à frente evita "horário no passado".
        depart = datetime.now(UTC) + timedelta(minutes=1)
        body["departureTime"] = depart.strftime("%Y-%m-%dT%H:%M:%SZ")
    return body


def _known_legs(
    stops: list[RouteStop], mode: TransportMode
) -> list[RouteLeg | None]:
    known: list[RouteLeg | None] = []
    for origin, dest in zip(stops, stops[1:]):
        short = _short_leg(origin, dest, mode)
        if short is not None:
            known.append(short)
            continue
        known.append(_cache_get(leg_cache_key(mode, origin, dest)))
    return known


async def _post_compute(
    client: Any,
    api_key: str,
    stops: list[RouteStop],
    mode: TransportMode,
) -> list[RouteLeg]:
    response = await client.post(
        _COMPUTE_URL,
        json=build_compute_body(stops, mode),
        headers={
            "X-Goog-Api-Key": api_key,
            "X-Goog-FieldMask": _FIELD_MASK,
            "Content-Type": "application/json",
        },
    )
    if _routes_new_blocked(response.status_code, getattr(response, "text", "") or ""):
        raise RuntimeError("routes_new_blocked")
    if response.status_code != 200:
        logger.warning("Routes API falhou: status={}", response.status_code)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Falha ao consultar rotas.",
        )
    legs = parse_compute_routes(response.json(), expected=len(stops) - 1)
    for leg, origin, dest in zip(legs, stops, stops[1:]):
        _cache_put(leg_cache_key(mode, origin, dest), leg)
    return legs


def _routes_new_blocked(status_code: int, body: str) -> bool:
    """Routes API desligada no projeto → Directions clássica (PRD já cita essa)."""
    if status_code != 403:
        return False
    lower = body.lower()
    return (
        "permission_denied" in lower
        or "has not been used" in lower
        or "blocked" in lower
        or "api_key" in lower
        or "routes" in lower
    )


def parse_legacy_directions(payload: dict[str, Any], expected: int) -> list[RouteLeg]:
    """Directions JSON: legs[].distance.value / duration.value, em metros e segundos."""
    if payload.get("status") != "OK":
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Falha ao consultar rotas.",
        )
    routes = payload.get("routes")
    if not isinstance(routes, list) or not routes or not isinstance(routes[0], dict):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Falha ao consultar rotas.",
        )
    raw_legs = routes[0].get("legs")
    if not isinstance(raw_legs, list) or len(raw_legs) != expected:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Falha ao consultar rotas.",
        )
    legs: list[RouteLeg] = []
    for raw in raw_legs:
        if not isinstance(raw, dict):
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Falha ao consultar rotas.",
            )
        distance = raw.get("distance") if isinstance(raw.get("distance"), dict) else {}
        duration = raw.get("duration") if isinstance(raw.get("duration"), dict) else {}
        meters = distance.get("value") if isinstance(distance, dict) else None
        seconds = duration.get("value") if isinstance(duration, dict) else None
        if isinstance(meters, bool) or not isinstance(meters, (int, float)):
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Falha ao consultar rotas.",
            )
        if isinstance(seconds, bool) or not isinstance(seconds, (int, float)):
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Falha ao consultar rotas.",
            )
        legs.append(
            RouteLeg(
                distance_meters=max(0, int(meters)),
                duration_seconds=max(0, int(seconds)),
            )
        )
    return legs


async def _fetch_legacy(
    client: Any,
    api_key: str,
    stops: list[RouteStop],
    mode: TransportMode,
) -> list[RouteLeg]:
    """Directions API. Trânsito não aceita waypoints — uma chamada por perna."""
    if mode == TransportMode.PUBLIC_TRANSIT and len(stops) > 2:
        batches = await asyncio.gather(
            *[
                _fetch_legacy_one(client, api_key, [origin, dest], mode)
                for origin, dest in zip(stops, stops[1:])
            ]
        )
        return [leg for batch in batches for leg in batch]
    return await _fetch_legacy_one(client, api_key, stops, mode)


async def _fetch_legacy_one(
    client: Any,
    api_key: str,
    stops: list[RouteStop],
    mode: TransportMode,
) -> list[RouteLeg]:
    origin = stops[0]
    dest = stops[-1]
    params: dict[str, Any] = {
        "origin": f"{origin.latitude},{origin.longitude}",
        "destination": f"{dest.latitude},{dest.longitude}",
        "mode": _LEGACY_MODE[mode],
        "language": "pt-BR",
        "key": api_key,
    }
    if len(stops) > 2:
        params["waypoints"] = "|".join(
            f"{stop.latitude},{stop.longitude}" for stop in stops[1:-1]
        )
    if mode == TransportMode.PUBLIC_TRANSIT:
        depart = datetime.now(UTC) + timedelta(minutes=1)
        params["departure_time"] = str(int(depart.timestamp()))
    response = await client.get(_DIRECTIONS_URL, params=params)
    if response.status_code != 200:
        logger.warning("Directions API falhou: status={}", response.status_code)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Falha ao consultar rotas.",
        )
    legs = parse_legacy_directions(response.json(), expected=len(stops) - 1)
    for leg, start, end in zip(legs, stops, stops[1:]):
        _cache_put(leg_cache_key(mode, start, end), leg)
    return legs


async def _fetch_run_new(
    client: Any,
    api_key: str,
    stops: list[RouteStop],
    mode: TransportMode,
) -> list[RouteLeg]:
    if mode != TransportMode.PUBLIC_TRANSIT or len(stops) == 2:
        return await _post_compute(client, api_key, stops, mode)
    batches = await asyncio.gather(
        *[
            _post_compute(client, api_key, [origin, dest], mode)
            for origin, dest in zip(stops, stops[1:])
        ]
    )
    return [leg for batch in batches for leg in batch]


async def _fetch_run(
    client: Any,
    api_key: str,
    stops: list[RouteStop],
    mode: TransportMode,
) -> list[RouteLeg]:
    try:
        return await _fetch_run_new(client, api_key, stops, mode)
    except RuntimeError as exc:
        if str(exc) != "routes_new_blocked":
            raise
        logger.warning("Routes API bloqueada; usando Directions clássica")
        return await _fetch_legacy(client, api_key, stops, mode)


async def _fill_missing(
    client: Any,
    api_key: str,
    stops: list[RouteStop],
    mode: TransportMode,
    known: list[RouteLeg | None],
) -> list[RouteLeg]:
    result: list[RouteLeg] = []
    index = 0
    total = len(known)
    while index < total:
        current = known[index]
        if current is not None:
            result.append(current)
            index += 1
            continue
        start = index
        while index < total and known[index] is None:
            index += 1
        run = stops[start : index + 1]
        result.extend(await _fetch_run(client, api_key, run, mode))
    return result


async def calculate_routes(
    body: CalculateRoutesRequest,
    *,
    client: Any | None = None,
) -> CalculateRoutesResponse:
    """Pernas alinhadas a `stops`. Cache e atalho < 40 m não batem no Google."""
    known = _known_legs(body.stops, body.travel_mode)
    if all(leg is not None for leg in known):
        return CalculateRoutesResponse(
            travel_mode=body.travel_mode,
            legs=[leg for leg in known if leg is not None],
        )

    api_key = _require_api_key()

    async def _run(http: Any) -> CalculateRoutesResponse:
        legs = await _fill_missing(
            http, api_key, body.stops, body.travel_mode, known
        )
        return CalculateRoutesResponse(travel_mode=body.travel_mode, legs=legs)

    try:
        if client is not None:
            return await _run(client)
        async with httpx.AsyncClient(timeout=12.0) as owned:
            return await _run(owned)
    except HTTPException:
        raise
    except httpx.TimeoutException as exc:
        logger.warning("Timeout na Routes API: stops={}", len(body.stops))
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Timeout ao consultar rotas.",
        ) from exc
    except httpx.HTTPError as exc:
        logger.error("Erro de rede na Routes API: {}", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Falha de rede ao consultar rotas.",
        ) from exc
