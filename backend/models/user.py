"""
Schemas Pydantic do domínio de usuário.

O formulário de preferências (Seção 3.3 do PRD) alimenta o prompt do Gemini
com sinais específicos — quanto mais granular, melhor o roteiro (RF06).
Validação no backend é a fonte da verdade (Seção 6.2).
"""
from datetime import UTC, datetime
from enum import Enum

from pydantic import BaseModel, Field, field_validator


class Interest(str, Enum):
    """Tags de vibe — escolha múltipla na tela 'Sua vibe'."""

    HISTORY_ARCHITECTURE = "history_architecture"
    STREET_FOOD = "street_food"
    FINE_DINING = "fine_dining"
    CAFES = "cafes"
    NIGHTLIFE = "nightlife"
    BARS = "bars"
    ART_MUSEUMS = "art_museums"
    BEACHES = "beaches"
    MOUNTAINS = "mountains"
    VIEWPOINTS = "viewpoints"
    SHOPPING = "shopping"
    ADVENTURE_SPORTS = "adventure_sports"
    WELLNESS = "wellness"
    FESTIVALS_EVENTS = "festivals_events"


class Pace(str, Enum):
    """Ritmo da viagem — define densidade do roteiro diário no prompt."""

    INTENSE = "intense"
    BALANCED = "balanced"
    RELAXED = "relaxed"


class TransportMode(str, Enum):
    """Locomoção preferida — orienta cálculo de deslocamento (PRD 3.2)."""

    WALKING = "walking"
    PUBLIC_TRANSIT = "public_transit"
    RIDE_HAIL = "ride_hail"


class DietaryStyle(str, Enum):
    """Restrição alimentar — evita sugestões incoerentes de restaurante (RF06.1)."""

    NONE = "none"
    VEGETARIAN = "vegetarian"
    VEGAN = "vegan"


class BudgetRange(str, Enum):
    ECONOMY = "economy"
    MODERATE = "moderate"
    PREMIUM = "premium"


class TravelerType(str, Enum):
    SOLO = "solo"
    COUPLE = "couple"
    FRIENDS = "friends"
    FAMILY = "family"


class SubscriptionTier(str, Enum):
    """Plano da conta — distinto de BudgetRange.PREMIUM (orçamento da viagem)."""

    FREE = "free"
    PRO = "pro"


class PushPlatform(str, Enum):
    IOS = "ios"
    ANDROID = "android"


# Telefone + tablet. O mais antigo sai.
MAX_PUSH_DEVICES = 5


class PushDevice(BaseModel):
    """Aparelho que pode receber Expo Push. O client não grava isso no Firestore."""

    token: str
    platform: PushPlatform
    timezone: str
    updated_at: datetime | None = None


def merge_push_devices(
    current: list[PushDevice],
    incoming: PushDevice,
    *,
    limit: int = MAX_PUSH_DEVICES,
) -> list[PushDevice]:
    """Substitui o mesmo token e corta a lista no teto, ficando com os mais novos."""
    kept = [device for device in current if device.token != incoming.token]
    kept.append(incoming)

    def _stamp(device: PushDevice) -> datetime:
        stamp = device.updated_at
        if stamp is None:
            return datetime.min.replace(tzinfo=UTC)
        if stamp.tzinfo is None:
            return stamp.replace(tzinfo=UTC)
        return stamp

    kept.sort(key=_stamp)
    if len(kept) > limit:
        kept = kept[-limit:]
    return kept


class TravelPreferences(BaseModel):
    """Preferências estáveis de viagem salvas em users/{uid}.travel_preferences."""

    interests: list[Interest] = Field(..., min_length=1)
    pace: Pace
    transport_modes: list[TransportMode] = Field(default_factory=list)
    dietary_style: DietaryStyle = DietaryStyle.NONE
    budget_range: BudgetRange
    traveler_type: TravelerType
    # Texto livre — cobre gostos que não cabem nas tags fixas (Seção 4/RF03).
    # Tratado como dado não confiável no prompt (sanitize_user_text).
    other_preferences: str = Field(default="", max_length=280)


class VibePick(BaseModel):
    """Cidade sugerida na Home. trip_id preenchido depois do primeiro roteiro."""

    destination: str = Field(..., min_length=2, max_length=80)
    reason: str = Field(..., min_length=2, max_length=180)
    trip_id: str | None = None


class VibePlacesDraft(BaseModel):
    """JSON curto do LLM — exatamente 3 cidades."""

    places: list[VibePick]


class VibePicksResponse(BaseModel):
    picks: list[VibePick]


class VibePickOpenResponse(BaseModel):
    """Toque no card. generate false = já existe viagem."""

    trip_id: str | None = None
    generate: bool = False
    destination: str = ""
    budget: str = ""
    days: int = 4
    start_date: str | None = None
    end_date: str | None = None


class BindVibePickRequest(BaseModel):
    trip_id: str = Field(..., min_length=8, max_length=128)


class UserInDB(BaseModel):
    uid: str
    email: str
    created_at: datetime
    travel_preferences: TravelPreferences | None = None
    # Campos de perfil (RF03) — gravados pelo client; defaults cobrem docs antigos.
    name: str = ""
    bio: str = ""
    photoBase64: str | None = None
    # Rede unidirecional de companheiros (UIDs). ArrayUnion no repo evita duplicata.
    companions: list[str] = Field(default_factory=list)
    # Billing — só o backend (Admin SDK) grava. Default cobre docs anteriores ao Pro.
    tier: SubscriptionTier = SubscriptionTier.FREE
    premium_until: datetime | None = None
    # Push — só o backend grava. Ausente = opt-out (docs antigos).
    notifications_enabled: bool = False
    push_devices: list[PushDevice] = Field(default_factory=list)

    @field_validator("push_devices", mode="before")
    @classmethod
    def _drop_bad_devices(cls, value: object) -> list:
        """Um token corrompido não pode derrubar a leitura do usuário inteiro."""
        if not isinstance(value, list):
            return []
        clean: list = []
        for item in value:
            if isinstance(item, PushDevice):
                clean.append(item)
                continue
            if not isinstance(item, dict):
                continue
            token = item.get("token")
            platform = item.get("platform")
            timezone = item.get("timezone")
            if not isinstance(token, str) or not token.strip():
                continue
            if platform not in ("ios", "android"):
                continue
            if not isinstance(timezone, str) or not timezone.strip():
                continue
            clean.append(item)
        return clean


class UserPublicProfile(BaseModel):
    """
    Fatia segura do perfil para terceiros autenticados.

    Nunca inclui email, created_at, companions, budget, dieta, other_preferences,
    status de assinatura (tier / premium_until) nem token de push.
    """

    uid: str
    name: str = ""
    bio: str = ""
    photoBase64: str | None = None
    interests: list[Interest] = Field(default_factory=list)
    pace: Pace | None = None
