"""
Acesso a dados da coleção `users/{uid}` no Firestore.

O client do firebase-admin é síncrono; para não bloquear o event loop do
FastAPI (RN04), cada operação de I/O é delegada a um threadpool via
run_in_threadpool. A camada de Services só enxerga métodos async.
"""
from firebase_admin import firestore
from loguru import logger
from starlette.concurrency import run_in_threadpool

from core.firebase import db
from models.user import TravelPreferences, UserInDB

_USERS_COLLECTION = "users"


async def get_user(uid: str) -> UserInDB | None:
    """Busca o documento do usuário; retorna None se ainda não existir."""

    def _fetch() -> UserInDB | None:
        snapshot = db.collection(_USERS_COLLECTION).document(uid).get()
        if not snapshot.exists:
            return None
        # Pydantic valida os dados vindos do banco antes de subirem na aplicação.
        return UserInDB.model_validate(snapshot.to_dict())

    return await run_in_threadpool(_fetch)


async def create_user_if_not_exists(uid: str, email: str) -> UserInDB:
    """
    Garante que exista um documento para o usuário recém-autenticado.

    Idempotente: se o documento já existe, apenas o retorna (não sobrescreve
    preferências já salvas). Chamado no primeiro login de cada sessão.
    """
    existing = await get_user(uid)
    if existing is not None:
        return existing

    def _create() -> None:
        db.collection(_USERS_COLLECTION).document(uid).set(
            {
                "uid": uid,
                "email": email,
                # SERVER_TIMESTAMP evita depender do relógio do servidor de app.
                "created_at": firestore.SERVER_TIMESTAMP,
                "travel_preferences": None,
            }
        )

    await run_in_threadpool(_create)
    logger.info("Novo documento de usuário criado no Firestore: uid={}", uid)

    # Relê para retornar o created_at já resolvido pelo servidor do Firestore.
    created = await get_user(uid)
    if created is None:
        # Situação teoricamente impossível logo após um set bem-sucedido.
        raise RuntimeError(f"Documento do usuário {uid} não encontrado após criação.")
    return created


async def save_preferences(uid: str, preferences: TravelPreferences) -> None:
    """Persiste as preferências de viagem no perfil do usuário."""

    def _update() -> None:
        # merge=True para não apagar email/created_at ao gravar as preferências.
        db.collection(_USERS_COLLECTION).document(uid).set(
            {"travel_preferences": preferences.model_dump(mode="json")},
            merge=True,
        )

    await run_in_threadpool(_update)
    logger.info("Preferências de viagem salvas: uid={}", uid)
