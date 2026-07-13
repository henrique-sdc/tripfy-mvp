"""
Schemas de request/response das rotas de autenticação.

O backend NUNCA recebe senha (Decisão 1 / Seção 6.2): o frontend autentica no
Firebase e envia apenas o ID Token no header Authorization. Por isso não há
schema de "login" ou "senha" aqui.
"""
from pydantic import BaseModel

from models.user import TravelPreferences


class SyncResponse(BaseModel):
    """
    Resposta de POST /auth/sync.

    `has_preferences` é derivado (travel_preferences != None) e usado pelo
    frontend para decidir entre onboarding e home — evita um segundo campo
    que poderia divergir do estado real.
    """

    uid: str
    email: str
    has_preferences: bool


class SavePreferencesRequest(BaseModel):
    """Corpo de PUT /auth/preferences — as preferências coletadas no onboarding."""

    preferences: TravelPreferences
