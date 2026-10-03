"""
Schemas Pydantic do domínio de viagem (RF05 / RF06 / RF07 / RF09).

Request: frontend envia só parâmetros da viagem (prefs vêm do Firestore).
Response: contrato JSON que o Gemini é forçado a respeitar (Structured Output)
e que a TripDetailScreen consome após remontar o SSE.
"""
from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from models.user import BudgetRange

# Parágrafo "como um morador". Cortar aqui evita derrubar o roteiro inteiro.
_LOCAL_LIFE_MAX = 800


def clip_local_life(value: object) -> str:
    return str(value or "").strip()[:_LOCAL_LIFE_MAX]


# Teto de produto: viagens longas demais degradam qualidade do roteiro LLM.
MAX_TRIP_DAYS = 15


def validate_inclusive_trip_dates(
    *,
    start_date: date,
    end_date: date,
    days: int,
) -> None:
    """Garante fim >= início e days == contagem inclusiva (1..MAX_TRIP_DAYS)."""
    if end_date < start_date:
        raise ValueError("end_date deve ser >= start_date")
    span = (end_date - start_date).days + 1
    if span > MAX_TRIP_DAYS:
        raise ValueError(f"Período máximo é {MAX_TRIP_DAYS} dias")
    if days != span:
        raise ValueError(
            f"days ({days}) deve ser igual a "
            f"(end_date - start_date).days + 1 ({span})"
        )


class GenerateTripRequest(BaseModel):
    """Corpo de POST /trips/generate — parâmetros da viagem, nada de perfil."""

    destination: str = Field(..., min_length=2, max_length=120)
    days: int = Field(..., ge=1, le=MAX_TRIP_DAYS)
    start_date: date
    end_date: date
    budget: BudgetRange
    # Texto livre — tratado como dado não confiável no prompt (anti-injection).
    notes: str = Field(default="", max_length=1000)

    @model_validator(mode="after")
    def check_date_span(self) -> "GenerateTripRequest":
        validate_inclusive_trip_dates(
            start_date=self.start_date,
            end_date=self.end_date,
            days=self.days,
        )
        return self


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
    # RF10: CTA GetYourGuide no card. Default False = roteiros antigos / parada manual.
    requires_ticket: bool = Field(
        default=False,
        description=(
            "True se a parada costuma exigir ingresso pago "
            "(museu, parque, show, tour). False na dúvida."
        ),
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
    local_life: str = Field(
        ...,
        description=(
            "Parágrafo de 3 ou 4 frases no tom de quem mora no destino. "
            "Não repete tips."
        ),
    )
    days: list[ItineraryDayResponse] = Field(..., min_length=1)

    @field_validator("local_life", mode="before")
    @classmethod
    def clip_life(cls, value: object) -> str:
        return clip_local_life(value)


class PersistedActivity(ActivityResponse):
    """Parada gravada no Firestore — campos de campo, não de LLM.

    Fora do response_schema do Gemini: senão o modelo geraria
    `completed`/`place_id` em toda parada e gastaria token à toa.
    `id` é identidade estável da edição conjunta — nunca deriva de título.
    """

    id: str = ""
    completed: bool = False
    place_id: str | None = None


class PersistedDay(BaseModel):
    """Dia persistido — permite activities vazias (Fase 2: +Dia)."""

    day: int = Field(..., ge=1)
    title: str = ""
    activities: list[PersistedActivity] = Field(default_factory=list)


class ChangeLogEntry(BaseModel):
    """Uma linha do histórico. A frase fica no app; aqui só o rótulo."""

    by: str = ""
    kind: str
    day: int | None = None
    at_ms: int = 0


class SavedTripResponse(BaseModel):
    """Viagem em users/{uid}/trips/{id} (listagem / detalhe / lixeira)."""

    id: str
    owner_uid: str
    destination: str
    # Título customizado; vazio = UI usa destination.
    title: str = ""
    summary: str
    tips: list[str] = Field(default_factory=list)
    # Parágrafo da geração. Vazio em viagem antiga — o cartão some.
    local_life: str = ""
    # Notas pessoais do dono (não geradas pela LLM).
    notes: str = ""

    @field_validator("local_life", mode="before")
    @classmethod
    def clip_life(cls, value: object) -> str:
        return clip_local_life(value)
    days: list[PersistedDay] = Field(default_factory=list)
    # Metadado da viagem (não vem do LLM) — deep links de OTA (RF10).
    start_date: date | None = None
    end_date: date | None = None
    # Metadado — roteiro gerado numa sessão de Match (não vem do LLM).
    match_id: str | None = None
    deleted_at: datetime | None = None
    cloned_from: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    is_owner: bool = True
    read_only: bool = False
    # Edição conjunta (Match, 2 pessoas). Ausente = viagem solo.
    collab: bool = False
    revision: int = 0
    member_uids: list[str] = Field(default_factory=list)
    last_op_id: str | None = None
    updated_by: str | None = None
    updated_by_name: str = ""
    # Rótulo da última op (title, reorder, …). A frase fica no app.
    last_change: str | None = None
    last_change_day: int | None = None
    # Linhas de texto (rótulo + hora). Teto 40. Sem snapshot e sem desfazer.
    change_log: list[ChangeLogEntry] = Field(default_factory=list)
    # owner | member | viewer — member no ponteiro da Home do convidado.
    role: str = "owner"
    # Ponteiro não carrega `days`; a lista usa isto no card.
    day_count: int = 0
    # Cache do geocoding do destino (clima). Não vem do LLM.
    destination_lat: float | None = None
    destination_lng: float | None = None
    # Feed Explorar. O client não escreve — só o Admin SDK.
    is_public: bool = False


class CloneTripResponse(BaseModel):
    """Resposta de POST /trips/{id}/clone."""

    id: str
    destination: str


class CreateTripRequest(BaseModel):
    """Corpo de POST /trips — persiste um roteiro novo (gate Free: 2 ativas)."""

    destination: str = Field(..., min_length=1, max_length=120)
    title: str = ""
    summary: str = ""
    tips: list[str] = Field(default_factory=list)
    local_life: str = ""
    notes: str = ""
    days: list[PersistedDay] = Field(default_factory=list)

    @field_validator("local_life", mode="before")
    @classmethod
    def clip_life(cls, value: object) -> str:
        return clip_local_life(value)
    start_date: date | None = None
    end_date: date | None = None
    match_id: str | None = Field(default=None, max_length=128)


class TripOpRequest(BaseModel):
    """Uma mutação da sala. `base_revision` é a revisão que o cliente enxergava."""

    op_id: str = Field(..., min_length=8, max_length=64)
    base_revision: int = Field(..., ge=0)
    type: Literal[
        "patch_activity",
        "delete_activity",
        "reorder_day",
        "patch_meta",
        "add_activity",
        "add_day",
        "delete_day",
    ]
    payload: dict[str, Any]


class TripOpResponse(BaseModel):
    """Estado depois da transação. `applied` falso = op_id repetido."""

    applied: bool
    trip: SavedTripResponse


class InviteCreatedResponse(BaseModel):
    """Plaintext uma vez. O Firestore guarda só o sha256."""

    token: str
    expires_at: datetime


class InvitePreviewResponse(BaseModel):
    """Tela de aceite — sem days, notas ou lista de UIDs."""

    trip_id: str
    owner_name: str = ""
    destination: str = ""
    title: str = ""
    day_count: int = 0
    already_member: bool = False


class AcceptInviteRequest(BaseModel):
    token: str = Field(..., min_length=20, max_length=200)


class ExploreSaveResponse(BaseModel):
    """Coração no roteiro público. Uma vez por pessoa."""

    saved: bool


def has_completed_place(days: list[PersistedDay], place_id: str) -> bool:
    """True se alguma parada feita aponta pra este Google place_id."""
    pid = place_id.strip()
    if not pid:
        return False
    return any(
        act.completed and act.place_id == pid
        for day in days
        for act in day.activities
    )


def user_has_completed_place(
    trips: list[SavedTripResponse], place_id: str
) -> bool:
    """Scan das viagens ativas do uid — teto Free é 2 docs."""
    return any(has_completed_place(trip.days, place_id) for trip in trips)
