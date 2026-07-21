"""
Proxy server-side do Google Places — RF07.

Tenta Places API (New); se a key/projeto bloquear (403), cai no clássico.
Foto sempre resolvida server-side (URI pública) — GOOGLE_MAPS_API_KEY não vaza.
"""
from __future__ import annotations

import re
from typing import Any

import httpx
from fastapi import HTTPException, status
from loguru import logger

from core.config import settings
from models.places import PlaceDetailsResponse, PlaceFullDetailsResponse

_SEARCH_URL_NEW = "https://places.googleapis.com/v1/places:searchText"
_SEARCH_URL_LEGACY = "https://maps.googleapis.com/maps/api/place/textsearch/json"
_DETAILS_URL_LEGACY = "https://maps.googleapis.com/maps/api/place/details/json"
_PHOTO_URL_LEGACY = "https://maps.googleapis.com/maps/api/place/photo"

_FIELD_MASK_SEARCH = (
    "places.id,places.photos,places.rating,"
    "places.userRatingCount,places.currentOpeningHours,places.location"
)
_FIELD_MASK_DETAILS = (
    "id,displayName,formattedAddress,nationalPhoneNumber,internationalPhoneNumber,"
    "websiteUri,editorialSummary,generativeSummary,regularOpeningHours,"
    "currentOpeningHours,rating,userRatingCount,photos,location,priceLevel"
)
_LEGACY_DETAILS_FIELDS = (
    "place_id,name,formatted_address,formatted_phone_number,international_phone_number,"
    "website,editorial_summary,opening_hours,rating,user_ratings_total,photos,geometry,"
    "price_level"
)

# Places (New) priceLevel → símbolos estilo Google Maps / Wanderlog.
_PRICE_LEVEL_NEW: dict[str, str] = {
    "PRICE_LEVEL_FREE": "Grátis",
    "PRICE_LEVEL_INEXPENSIVE": "$",
    "PRICE_LEVEL_MODERATE": "$$",
    "PRICE_LEVEL_EXPENSIVE": "$$$",
    "PRICE_LEVEL_VERY_EXPENSIVE": "$$$$",
}
_PRICE_LEVEL_LEGACY: dict[int, str] = {
    0: "Grátis",
    1: "$",
    2: "$$",
    3: "$$$",
    4: "$$$$",
}

_BIAS_RADIUS_M = 5000.0
_PHOTO_MAX_PX = 800
_MAX_DETAIL_PHOTOS = 5
# Place IDs Google: tipicamente ChIJ… / alfanumérico; evita path injection.
_PLACE_ID_RE = re.compile(r"^[A-Za-z0-9_\-]{10,256}$")


def validate_place_id(place_id: str) -> str:
    """Normaliza e valida place_id; levanta 422 se inválido."""
    cleaned = place_id.strip()
    if cleaned.startswith("places/"):
        cleaned = cleaned[len("places/") :]
    if not _PLACE_ID_RE.match(cleaned):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="place_id inválido.",
        )
    return cleaned


def extract_place_id_new(place: dict[str, Any]) -> str | None:
    """Extrai o id curto a partir do Place (New)."""
    pid = place.get("id")
    if isinstance(pid, str) and pid.strip():
        return pid.removeprefix("places/").strip() or None
    name = place.get("name")
    if isinstance(name, str) and name.startswith("places/"):
        return name[len("places/") :].strip() or None
    return None


def map_place_to_details(
    place: dict[str, Any],
    photo_url: str | None,
) -> PlaceDetailsResponse:
    """Extrai o contrato leve a partir do JSON Places (New)."""
    opening = place.get("currentOpeningHours") or {}
    open_now = opening.get("openNow")
    if open_now is not None and not isinstance(open_now, bool):
        open_now = None

    rating = place.get("rating")
    if rating is not None:
        try:
            rating = float(rating)
        except (TypeError, ValueError):
            rating = None

    reviews = place.get("userRatingCount")
    if reviews is not None:
        try:
            reviews = int(reviews)
        except (TypeError, ValueError):
            reviews = None

    location = place.get("location") if isinstance(place.get("location"), dict) else {}
    return PlaceDetailsResponse(
        place_id=extract_place_id_new(place),
        photo_url=photo_url,
        rating=rating,
        reviews_count=reviews,
        open_now=open_now,
        latitude=_as_float(location.get("latitude")),
        longitude=_as_float(location.get("longitude")),
    )


def map_legacy_result_to_details(
    result: dict[str, Any],
    photo_url: str | None,
) -> PlaceDetailsResponse:
    """Mesmo contrato a partir do Text Search clássico."""
    opening = result.get("opening_hours") or {}
    open_now = opening.get("open_now")
    if open_now is not None and not isinstance(open_now, bool):
        open_now = None

    rating = result.get("rating")
    if rating is not None:
        try:
            rating = float(rating)
        except (TypeError, ValueError):
            rating = None

    reviews = result.get("user_ratings_total")
    if reviews is not None:
        try:
            reviews = int(reviews)
        except (TypeError, ValueError):
            reviews = None

    raw_id = result.get("place_id")
    place_id = raw_id.strip() if isinstance(raw_id, str) and raw_id.strip() else None

    geometry = result.get("geometry") or {}
    loc = geometry.get("location") if isinstance(geometry, dict) else {}
    lat = _as_float(loc.get("lat")) if isinstance(loc, dict) else None
    lng = _as_float(loc.get("lng")) if isinstance(loc, dict) else None

    return PlaceDetailsResponse(
        place_id=place_id,
        photo_url=photo_url,
        rating=rating,
        reviews_count=reviews,
        open_now=open_now,
        latitude=lat,
        longitude=lng,
    )


def _require_api_key() -> str:
    api_key = settings.GOOGLE_MAPS_API_KEY.strip()
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Serviço de lugares temporariamente indisponível.",
        )
    return api_key


async def _resolve_photo_uri_new(
    client: httpx.AsyncClient,
    photo_name: str,
    api_key: str,
) -> str | None:
    """Places (New): skipHttpRedirect → photoUri googleusercontent."""
    media_url = f"https://places.googleapis.com/v1/{photo_name}/media"
    response = await client.get(
        media_url,
        params={
            "maxWidthPx": _PHOTO_MAX_PX,
            "maxHeightPx": _PHOTO_MAX_PX,
            "skipHttpRedirect": "true",
            "key": api_key,
        },
    )
    if response.status_code != 200:
        logger.warning(
            "Falha ao resolver foto Places (New): status={} name={}",
            response.status_code,
            photo_name[:80],
        )
        return None

    uri = response.json().get("photoUri")
    return uri if isinstance(uri, str) and uri else None


async def _resolve_photo_uri_legacy(
    client: httpx.AsyncClient,
    photo_reference: str,
    api_key: str,
) -> str | None:
    """Places clássico: Location do redirect (sem key na URL final)."""
    response = await client.get(
        _PHOTO_URL_LEGACY,
        params={
            "maxwidth": _PHOTO_MAX_PX,
            "photo_reference": photo_reference,
            "key": api_key,
        },
        follow_redirects=False,
    )
    if response.status_code in (301, 302, 303, 307, 308):
        location = response.headers.get("location")
        if location and location.startswith("http"):
            return location
    logger.warning(
        "Falha ao resolver foto Places (legacy): status={}",
        response.status_code,
    )
    return None


async def _resolve_photos_new(
    client: httpx.AsyncClient,
    photos: list[Any],
    api_key: str,
    limit: int = _MAX_DETAIL_PHOTOS,
) -> list[str]:
    urls: list[str] = []
    for photo in photos[:limit]:
        if not isinstance(photo, dict):
            continue
        name = photo.get("name")
        if isinstance(name, str) and name:
            uri = await _resolve_photo_uri_new(client, name, api_key)
            if uri:
                urls.append(uri)
    return urls


async def _resolve_photos_legacy(
    client: httpx.AsyncClient,
    photos: list[Any],
    api_key: str,
    limit: int = _MAX_DETAIL_PHOTOS,
) -> list[str]:
    urls: list[str] = []
    for photo in photos[:limit]:
        if not isinstance(photo, dict):
            continue
        ref = photo.get("photo_reference")
        if isinstance(ref, str) and ref:
            uri = await _resolve_photo_uri_legacy(client, ref, api_key)
            if uri:
                urls.append(uri)
    return urls


def _is_places_new_blocked(status_code: int, body: str) -> bool:
    """403 / PERMISSION_DENIED / API não habilitada → tenta legacy."""
    if status_code != 403:
        return False
    lower = body.lower()
    return (
        "permission_denied" in lower
        or "has not been used" in lower
        or "blocked" in lower
        or "api_key" in lower
    )


def _as_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _as_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def format_price_level_new(raw: Any) -> str | None:
    """Converte enum Places (New) em $, $$…; ignora UNKNOWN/unspecified."""
    if not isinstance(raw, str):
        return None
    return _PRICE_LEVEL_NEW.get(raw.strip())


def format_price_level_legacy(raw: Any) -> str | None:
    """Legacy usa inteiro 0–4."""
    level = _as_int(raw)
    if level is None:
        return None
    return _PRICE_LEVEL_LEGACY.get(level)


def extract_menu_uri(place: dict[str, Any]) -> str | None:
    """
    Google não documenta menuUri estável na Places API.
    Aceita chaves experimentais se aparecerem; senão None (não inventa URL).
    """
    for key in ("menuUri", "menu_uri"):
        value = place.get(key)
        if isinstance(value, str) and value.startswith("http"):
            return value
    return None


def map_new_details_to_full(
    place: dict[str, Any],
    place_id: str,
    photo_urls: list[str],
) -> PlaceFullDetailsResponse:
    """Mapeia Place Details (New) → contrato do app."""
    display = place.get("displayName") or {}
    name = display.get("text") if isinstance(display, dict) else None

    editorial = place.get("editorialSummary") or {}
    summary = editorial.get("text") if isinstance(editorial, dict) else None
    if not summary:
        generative = place.get("generativeSummary") or {}
        overview = generative.get("overview") if isinstance(generative, dict) else None
        if isinstance(overview, dict):
            summary = overview.get("text")

    regular = place.get("regularOpeningHours") or {}
    weekday = regular.get("weekdayDescriptions") or []
    if not isinstance(weekday, list):
        weekday = []
    weekday_text = [str(line) for line in weekday if line]

    current = place.get("currentOpeningHours") or {}
    open_now = current.get("openNow")
    if open_now is not None and not isinstance(open_now, bool):
        open_now = None

    location = place.get("location") or {}
    lat = _as_float(location.get("latitude")) if isinstance(location, dict) else None
    lng = _as_float(location.get("longitude")) if isinstance(location, dict) else None

    phone = place.get("nationalPhoneNumber") or place.get("internationalPhoneNumber")
    website = place.get("websiteUri")

    return PlaceFullDetailsResponse(
        place_id=extract_place_id_new(place) or place_id,
        name=name if isinstance(name, str) else None,
        formatted_address=(
            place.get("formattedAddress")
            if isinstance(place.get("formattedAddress"), str)
            else None
        ),
        phone=phone if isinstance(phone, str) else None,
        website=website if isinstance(website, str) else None,
        editorial_summary=summary if isinstance(summary, str) else None,
        weekday_text=weekday_text,
        open_now=open_now,
        rating=_as_float(place.get("rating")),
        reviews_count=_as_int(place.get("userRatingCount")),
        photo_urls=photo_urls,
        latitude=lat,
        longitude=lng,
        price_level=format_price_level_new(place.get("priceLevel")),
        menu_uri=extract_menu_uri(place),
    )


def map_legacy_details_to_full(
    result: dict[str, Any],
    place_id: str,
    photo_urls: list[str],
) -> PlaceFullDetailsResponse:
    """Mapeia Place Details clássico → contrato do app."""
    opening = result.get("opening_hours") or {}
    open_now = opening.get("open_now")
    if open_now is not None and not isinstance(open_now, bool):
        open_now = None
    weekday = opening.get("weekday_text") or []
    if not isinstance(weekday, list):
        weekday = []
    weekday_text = [str(line) for line in weekday if line]

    editorial = result.get("editorial_summary") or {}
    summary = editorial.get("overview") if isinstance(editorial, dict) else None

    geometry = result.get("geometry") or {}
    loc = geometry.get("location") if isinstance(geometry, dict) else {}
    lat = _as_float(loc.get("lat")) if isinstance(loc, dict) else None
    lng = _as_float(loc.get("lng")) if isinstance(loc, dict) else None

    phone = result.get("formatted_phone_number") or result.get(
        "international_phone_number"
    )
    raw_id = result.get("place_id")
    resolved_id = (
        raw_id.strip() if isinstance(raw_id, str) and raw_id.strip() else place_id
    )

    return PlaceFullDetailsResponse(
        place_id=resolved_id,
        name=result.get("name") if isinstance(result.get("name"), str) else None,
        formatted_address=(
            result.get("formatted_address")
            if isinstance(result.get("formatted_address"), str)
            else None
        ),
        phone=phone if isinstance(phone, str) else None,
        website=result.get("website") if isinstance(result.get("website"), str) else None,
        editorial_summary=summary if isinstance(summary, str) else None,
        weekday_text=weekday_text,
        open_now=open_now,
        rating=_as_float(result.get("rating")),
        reviews_count=_as_int(result.get("user_ratings_total")),
        photo_urls=photo_urls,
        latitude=lat,
        longitude=lng,
        price_level=format_price_level_legacy(result.get("price_level")),
        menu_uri=extract_menu_uri(result),
    )


async def _lookup_places_new(
    client: httpx.AsyncClient,
    api_key: str,
    query: str,
    lat: float | None,
    lng: float | None,
) -> PlaceDetailsResponse | None:
    body: dict[str, Any] = {
        "textQuery": query,
        "languageCode": "pt-BR",
        "pageSize": 1,
    }
    if lat is not None and lng is not None:
        body["locationBias"] = {
            "circle": {
                "center": {"latitude": lat, "longitude": lng},
                "radius": _BIAS_RADIUS_M,
            }
        }

    search = await client.post(
        _SEARCH_URL_NEW,
        headers={
            "Content-Type": "application/json",
            "X-Goog-Api-Key": api_key,
            "X-Goog-FieldMask": _FIELD_MASK_SEARCH,
        },
        json=body,
    )

    if _is_places_new_blocked(search.status_code, search.text):
        logger.warning(
            "Places API (New) bloqueada/desabilitada (403) — fallback legacy. "
            "Habilite em: https://console.cloud.google.com/apis/library/places.googleapis.com"
        )
        raise RuntimeError("places_new_blocked")

    if search.status_code != 200:
        logger.error(
            "Places Text Search (New) falhou: status={} body={}",
            search.status_code,
            search.text[:300],
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Falha ao consultar o Google Places.",
        )

    places = search.json().get("places") or []
    if not places:
        return None

    place = places[0]
    photo_url: str | None = None
    photos = place.get("photos") or []
    if photos:
        photo_name = photos[0].get("name")
        if isinstance(photo_name, str) and photo_name:
            photo_url = await _resolve_photo_uri_new(client, photo_name, api_key)

    return map_place_to_details(place, photo_url)


async def _lookup_places_legacy(
    client: httpx.AsyncClient,
    api_key: str,
    query: str,
    lat: float | None,
    lng: float | None,
) -> PlaceDetailsResponse | None:
    params: dict[str, Any] = {
        "query": query,
        "language": "pt-BR",
        "key": api_key,
    }
    if lat is not None and lng is not None:
        params["location"] = f"{lat},{lng}"
        params["radius"] = int(_BIAS_RADIUS_M)

    search = await client.get(_SEARCH_URL_LEGACY, params=params)

    if search.status_code != 200:
        logger.error(
            "Places Text Search (legacy) HTTP falhou: status={} body={}",
            search.status_code,
            search.text[:300],
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Falha ao consultar o Google Places.",
        )

    payload = search.json()
    api_status = payload.get("status")
    if api_status == "ZERO_RESULTS":
        return None
    if api_status == "REQUEST_DENIED":
        logger.error(
            "Places legacy REQUEST_DENIED: {}",
            str(payload.get("error_message", ""))[:300],
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Google Places negou a chave. No Cloud Console: habilite "
                "'Places API' (e/ou Places API New) e libere a API na restrição da key."
            ),
        )
    if api_status != "OK":
        logger.error(
            "Places legacy status inesperado: {} msg={}",
            api_status,
            str(payload.get("error_message", ""))[:200],
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Falha ao consultar o Google Places.",
        )

    results = payload.get("results") or []
    if not results:
        return None

    result = results[0]
    photo_url: str | None = None
    photos = result.get("photos") or []
    if photos:
        ref = photos[0].get("photo_reference")
        if isinstance(ref, str) and ref:
            photo_url = await _resolve_photo_uri_legacy(client, ref, api_key)

    return map_legacy_result_to_details(result, photo_url)


async def lookup_place(
    query: str,
    lat: float | None = None,
    lng: float | None = None,
) -> PlaceDetailsResponse:
    """Busca o primeiro resultado e enriquece com foto + place_id."""
    api_key = _require_api_key()

    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            details: PlaceDetailsResponse | None
            try:
                details = await _lookup_places_new(client, api_key, query, lat, lng)
            except RuntimeError as exc:
                if str(exc) != "places_new_blocked":
                    raise
                details = await _lookup_places_legacy(
                    client, api_key, query, lat, lng
                )

            if details is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Nenhum lugar encontrado para esta busca.",
                )

    except HTTPException:
        raise
    except httpx.TimeoutException as exc:
        logger.warning("Timeout no Google Places: query={}", query[:80])
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Timeout ao consultar o Google Places.",
        ) from exc
    except httpx.HTTPError as exc:
        logger.error("Erro de rede no Google Places: {}", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Falha de rede ao consultar o Google Places.",
        ) from exc

    logger.info(
        "Places lookup ok: query={!r} place_id={} rating={} has_photo={}",
        query[:80],
        details.place_id,
        details.rating,
        bool(details.photo_url),
    )
    return details


async def _details_places_new(
    client: httpx.AsyncClient,
    api_key: str,
    place_id: str,
) -> PlaceFullDetailsResponse | None:
    url = f"https://places.googleapis.com/v1/places/{place_id}"
    response = await client.get(
        url,
        headers={
            "Content-Type": "application/json",
            "X-Goog-Api-Key": api_key,
            "X-Goog-FieldMask": _FIELD_MASK_DETAILS,
        },
        params={"languageCode": "pt-BR"},
    )

    if _is_places_new_blocked(response.status_code, response.text):
        logger.warning(
            "Places Details (New) bloqueada (403) — fallback legacy."
        )
        raise RuntimeError("places_new_blocked")

    if response.status_code == 404:
        return None

    if response.status_code != 200:
        logger.error(
            "Places Details (New) falhou: status={} body={}",
            response.status_code,
            response.text[:300],
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Falha ao consultar detalhes do Google Places.",
        )

    place = response.json()
    photos = place.get("photos") or []
    photo_urls = await _resolve_photos_new(client, photos, api_key)
    return map_new_details_to_full(place, place_id, photo_urls)


async def _details_places_legacy(
    client: httpx.AsyncClient,
    api_key: str,
    place_id: str,
) -> PlaceFullDetailsResponse | None:
    response = await client.get(
        _DETAILS_URL_LEGACY,
        params={
            "place_id": place_id,
            "fields": _LEGACY_DETAILS_FIELDS,
            "language": "pt-BR",
            "key": api_key,
        },
    )

    if response.status_code != 200:
        logger.error(
            "Places Details (legacy) HTTP falhou: status={} body={}",
            response.status_code,
            response.text[:300],
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Falha ao consultar detalhes do Google Places.",
        )

    payload = response.json()
    api_status = payload.get("status")
    if api_status in ("NOT_FOUND", "INVALID_REQUEST", "ZERO_RESULTS"):
        return None
    if api_status == "REQUEST_DENIED":
        logger.error(
            "Places Details legacy REQUEST_DENIED: {}",
            str(payload.get("error_message", ""))[:300],
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Google Places negou a chave. Habilite Places API "
                "(e/ou Places API New) na restrição da key."
            ),
        )
    if api_status != "OK":
        logger.error(
            "Places Details legacy status inesperado: {} msg={}",
            api_status,
            str(payload.get("error_message", ""))[:200],
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Falha ao consultar detalhes do Google Places.",
        )

    result = payload.get("result") or {}
    photos = result.get("photos") or []
    photo_urls = await _resolve_photos_legacy(client, photos, api_key)
    return map_legacy_details_to_full(result, place_id, photo_urls)


async def get_place_details(place_id: str) -> PlaceFullDetailsResponse:
    """Place Details rico (New → fallback legacy)."""
    place_id = validate_place_id(place_id)
    api_key = _require_api_key()

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            details: PlaceFullDetailsResponse | None
            try:
                details = await _details_places_new(client, api_key, place_id)
            except RuntimeError as exc:
                if str(exc) != "places_new_blocked":
                    raise
                details = await _details_places_legacy(client, api_key, place_id)

            if details is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Lugar não encontrado para este place_id.",
                )

    except HTTPException:
        raise
    except httpx.TimeoutException as exc:
        logger.warning("Timeout no Places Details: place_id={}", place_id[:40])
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Timeout ao consultar detalhes do Google Places.",
        ) from exc
    except httpx.HTTPError as exc:
        logger.error("Erro de rede no Places Details: {}", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Falha de rede ao consultar detalhes do Google Places.",
        ) from exc

    logger.info(
        "Places details ok: place_id={} name={!r} photos={}",
        details.place_id,
        (details.name or "")[:60],
        len(details.photo_urls),
    )
    return details
