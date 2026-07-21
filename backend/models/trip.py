"""
Schemas Pydantic do domínio de viagem (RF05 / RF06 / RF07 / RF09).

Request: frontend envia só parâmetros da viagem (prefs vêm do Firestore).
Response: contrato JSON que o Gemini é forçado a respeitar (Structured Output)
e que a TripDetailScreen consome após remontar o SSE.
"""
from datetime import datetime

from pydantic import BaseModel, Field

from models.user import BudgetRange


class GenerateTripRequest(BaseModel):
    """Corpo de POST /trips/generate — parâmetros da viagem, nada de perfil."""

    destination: str = Field(..., min_length=2, max_length=120)
    days: int = Field(..., ge=1, le=30)
    budget: BudgetRange
    # Texto livre — tratado como dado não confiável no prompt (anti-injection).
    notes: str = Field(default="", max_length=1000)


class ActivityResponse(BaseModel):
    """Parada do dia — `description` carrega a estimativa de deslocamento (RF06.1)."""

    time: str = Field(..., description="Horário sugerido, ex.: 09:00")
    title: str = Field(..., description="Nome curto da atração/atividade")
    description: str = Field(
        ...,
        description=(
            "Detalhe da parada + estimativa realista de tempo/meio de "
            "deslocamento a partir da atividade anterior (transport_modes)."
        ),
    )
    location: str = Field(
        ...,
        description="Local ou endereço aproximado (útil p/ Maps no app)",
    )
    # Opcionais: IA estima; o app plota só quando ambos vierem preenchidos.
    latitude: float | None = Field(
        default=None,
        description="Latitude WGS84 estimada do local (null se incerta)",
    )
    longitude: float | None = Field(
        default=None,
        description="Longitude WGS84 estimada do local (null se incerta)",
    )


class ItineraryDayResponse(BaseModel):
    """Um dia do roteiro, com lista ordenada de atividades."""

    day: int = Field(..., ge=1, description="Número do dia (1-based)")
    title: str = Field(..., description="Tema do dia, ex.: Centro histórico")
    activities: list[ActivityResponse] = Field(..., min_length=1)


class ItineraryResponse(BaseModel):
    """Roteiro completo — schema passado ao Gemini via response_schema."""

    destination: str
    summary: str = Field(..., description="Resumo curto do roteiro em 1–2 frases")
    tips: list[str] = Field(
        ...,
        min_length=3,
        max_length=5,
        description=(
            "3 a 5 dicas práticas e específicas do destino (cultura, etiqueta, "
            "segurança, clima, deslocamento, costumes locais). Sem genericidades."
        ),
    )
    days: list[ItineraryDayResponse] = Field(..., min_length=1)


class PersistedDay(BaseModel):
    """Dia persistido — permite activities vazias (Fase 2: +Dia)."""

    day: int = Field(..., ge=1)
    title: str = ""
    activities: list[ActivityResponse] = Field(default_factory=list)


class SavedTripResponse(BaseModel):
    """Viagem em users/{uid}/trips/{id} (listagem / detalhe / lixeira)."""

    id: str
    owner_uid: str
    destination: str
    summary: str
    tips: list[str] = Field(default_factory=list)
    # Notas pessoais do dono (não geradas pela LLM).
    notes: str = ""
    days: list[PersistedDay] = Field(default_factory=list)
    deleted_at: datetime | None = None
    cloned_from: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    is_owner: bool = True
    read_only: bool = False


class CloneTripResponse(BaseModel):
    """Resposta de POST /trips/{id}/clone."""

    id: str
    destination: str
