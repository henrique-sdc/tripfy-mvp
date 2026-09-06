"""
Schemas de request/response das rotas de autenticação.

O backend NUNCA recebe senha (Decisão 1 / Seção 6.2): o frontend autentica no
Firebase e envia apenas o ID Token no header Authorization. Por isso não há
schema de "login" ou "senha" aqui.
"""
from datetime import datetime

from pydantic import BaseModel

from models.user import SubscriptionTier, TravelPreferences


class SyncResponse(BaseModel):
    """
    Resposta de POST /auth/sync.

    `has_preferences` é derivado (travel_preferences != None) e usado pelo
    frontend para decidir entre onboarding e home — evita um segundo campo
    que poderia divergir do estado real.

    `is_premium` também é derivado (tier + premium_until) — nunca persistido.
    """

    uid: str
    email: str
    has_preferences: bool
    is_premium: bool = False
    tier: SubscriptionTier = SubscriptionTier.FREE
    premium_until: datetime | None = None


class SavePreferencesRequest(BaseModel):
    """Corpo de PUT /auth/preferences — as preferências coletadas no onboarding."""

    preferences: TravelPreferences
