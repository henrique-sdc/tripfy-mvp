"""
Contrato de POST /routes/calculate (RF06.1).

Números crus — o app formata "15 min" e "1,2 km" no idioma da UI.
"""
from pydantic import BaseModel, Field

from models.user import TransportMode


class RouteStop(BaseModel):
    """Ponto WGS84 na ordem do dia."""

    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)


class CalculateRoutesRequest(BaseModel):
    """Cadeia do dia visível. 2–8 paradas = no máximo 7 pernas."""

    travel_mode: TransportMode
    stops: list[RouteStop] = Field(..., min_length=2, max_length=8)


class RouteLeg(BaseModel):
    """Uma perna entre paradas consecutivas."""

    distance_meters: int = Field(..., ge=0)
    duration_seconds: int = Field(..., ge=0)


class CalculateRoutesResponse(BaseModel):
    """`legs` tem um item a menos que `stops`, na mesma ordem."""

    travel_mode: TransportMode
    legs: list[RouteLeg]
