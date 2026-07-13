"""
Dependência de autenticação do FastAPI.

O frontend autentica no Firebase e envia o ID Token no header
`Authorization: Bearer <token>`. Aqui validamos esse token com o Admin SDK e
extraímos o uid/email. Nenhuma senha trafega pelo backend (Decisão 1).
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth as firebase_auth
from loguru import logger
from pydantic import BaseModel

# `import core.firebase` garante que o Admin SDK já foi inicializado antes de
# qualquer verificação de token acontecer.
import core.firebase  # noqa: F401

# auto_error=False para devolvermos nossa própria mensagem 401 padronizada
# quando o header estiver ausente, em vez do erro genérico do FastAPI.
_bearer_scheme = HTTPBearer(auto_error=False)


class CurrentUser(BaseModel):
    """Identidade extraída do ID Token validado."""

    uid: str
    email: str


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
) -> CurrentUser:
    """Valida o ID Token do Firebase e retorna o usuário autenticado."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de autenticação ausente.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        # verify_id_token confere assinatura, expiração e emissor do token.
        decoded = firebase_auth.verify_id_token(credentials.credentials)
    except Exception as exc:
        # Log estruturado sem vazar o token em si (apenas o motivo).
        logger.warning("Falha ao verificar ID Token: {}", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de autenticação inválido ou expirado.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return CurrentUser(uid=decoded["uid"], email=decoded.get("email", ""))
