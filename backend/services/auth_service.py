"""
Camada de regra de negócio da autenticação (Use Cases).

Fica entre o Router (HTTP) e o Repository (dados), conforme a Clean
Architecture obrigatória do PRD (Seção 2.2). Aqui vive a decisão de "o que
fazer", enquanto o repository cuida apenas de "como acessar os dados".
"""
from models.auth import SyncResponse
from models.user import TravelPreferences, UserInDB
from repositories import user_repository
from services.entitlement_service import is_premium_effective


def sync_response_from_user(user: UserInDB) -> SyncResponse:
    """Monta o contrato de sync — is_premium derivado, nunca lido cru do doc."""
    return SyncResponse(
        uid=user.uid,
        email=user.email,
        has_preferences=user.travel_preferences is not None,
        is_premium=is_premium_effective(user),
        tier=user.tier,
        premium_until=user.premium_until,
    )


async def sync_user(uid: str, email: str) -> SyncResponse:
    """
    Sincroniza o usuário autenticado com o Firestore.

    Cria o documento no primeiro login e informa ao frontend se o onboarding
    de preferências já foi concluído (para decidir entre onboarding e home).
    """
    user = await user_repository.create_user_if_not_exists(uid, email)
    return sync_response_from_user(user)


async def save_user_preferences(uid: str, preferences: TravelPreferences) -> None:
    """Salva as preferências de viagem coletadas no onboarding."""
    await user_repository.save_preferences(uid, preferences)
