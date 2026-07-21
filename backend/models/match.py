"""
Schemas Pydantic da sessão de Match de Viajantes (RF11/RF12).

O frontend envia apenas parâmetros da viagem. Identidade, participantes e
estado da sessão são definidos pelo backend.
"""
from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, model_validator

from models.trip import ItineraryResponse
from models.user import BudgetRange, UserPublicProfile


class MatchStatus(str, Enum):
    """Estados persistidos da sessão colaborativa."""

    WAITING = "waiting"
    GENERATING = "generating"
    COMPLETED = "completed"


class CreateMatchRequest(BaseModel):
    """Corpo de POST /matches."""

    model_config = ConfigDict(str_strip_whitespace=True)

    destination: str = Field(..., min_length=2, max_length=120)
    days: int = Field(..., ge=1, le=30)
    budget: BudgetRange
    # Pedido especial do dono da sessão — mesmo teto do Solo (RF05).
    notes: str = Field(default="", max_length=1000)


class JoinMatchRequest(BaseModel):
    """Corpo opcional de POST /matches/{id}/join."""

    model_config = ConfigDict(str_strip_whitespace=True)

    # Pedido especial do convidado — única voz dele além da vibe do perfil.
    notes: str = Field(default="", max_length=1000)


class GenerationLock(BaseModel):
    """Lock curto usado para impedir duas gerações pagas da mesma sessão."""

    token: str
    locked_by: str
    locked_at: datetime


class MatchInDB(BaseModel):
    """Representação validada de `matches/{match_id}`."""

    id: str
    destination: str
    days: int
    budget: BudgetRange
    notes: str = ""
    guest_notes: str = ""
    owner_uid: str
    participants: list[str] = Field(..., min_length=1, max_length=2)
    status: MatchStatus
    created_at: datetime
    generation_lock: GenerationLock | None = None
    itinerary: ItineraryResponse | None = None
    completed_at: datetime | None = None

    @model_validator(mode="after")
    def validate_participants(self) -> "MatchInDB":
        """Impede documentos inconsistentes de atravessarem o Repository."""
        if self.owner_uid not in self.participants:
            raise ValueError("owner_uid deve estar em participants")
        if len(set(self.participants)) != len(self.participants):
            raise ValueError("participants não pode conter UIDs duplicados")
        return self


class MatchInviteSummary(BaseModel):
    """Visão pré-join: parâmetros da viagem + fatia pública do anfitrião."""

    id: str
    destination: str
    days: int
    budget: BudgetRange
    status: MatchStatus
    owner: UserPublicProfile
