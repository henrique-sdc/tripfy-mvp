"""
Regras de negócio do perfil público e da rede de companheiros.

O client não pode ler users/{outroUid} (firestore.rules); este service é o
proxy autenticado que devolve só a fatia pública.
"""
from fastapi import HTTPException, status
from loguru import logger

from models.user import UserPublicProfile
from repositories import user_repository


async def get_public_profile(uid: str) -> UserPublicProfile:
    """Retorna o perfil público ou 404 se o usuário não existir."""
    profile = await user_repository.get_public_profile(uid)
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuário não encontrado.",
        )
    return profile


async def add_companion(my_uid: str, target_uid: str) -> None:
    """
    Vincula my ↔ target (mútuo).

    - 400 se tentar adicionar a si mesmo
    - 404 se o alvo não existir no Firestore
    - Idempotente via ArrayUnion no repository
    """
    if my_uid == target_uid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Não é possível adicionar a si mesmo como companheiro.",
        )

    target = await user_repository.get_user(target_uid)
    if target is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuário não encontrado.",
        )

    me = await user_repository.get_user(my_uid)
    if me is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuário não encontrado.",
        )

    await user_repository.add_companion(my_uid, target_uid)
    logger.info(
        "Companheiros vinculados (mútuo): my_uid={} target_uid={}",
        my_uid,
        target_uid,
    )


async def remove_companion(my_uid: str, target_uid: str) -> None:
    """Remove a amizade nos dois lados (idempotente)."""
    await user_repository.remove_companion(my_uid, target_uid)
    logger.info(
        "Companheiros desvinculados (mútuo): my_uid={} target_uid={}",
        my_uid,
        target_uid,
    )


async def list_my_companions(my_uid: str) -> list[UserPublicProfile]:
    """Lista hidratada dos companheiros do usuário logado."""
    return await user_repository.list_companions(my_uid)
