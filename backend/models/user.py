"""
Schemas Pydantic do domínio de usuário.

O formulário de preferências (Seção 3.3 do PRD) alimenta o prompt do Gemini
com sinais específicos — quanto mais granular, melhor o roteiro (RF06).
Validação no backend é a fonte da verdade (Seção 6.2).
"""
from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


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


class UserPublicProfile(BaseModel):
    """
    Fatia segura do perfil para terceiros autenticados.

    Nunca inclui email, created_at, companions, budget, dieta, other_preferences
    nem status de assinatura (tier / premium_until).
    """

    uid: str
    name: str = ""
    bio: str = ""
    photoBase64: str | None = None
    interests: list[Interest] = Field(default_factory=list)
    pace: Pace | None = None
