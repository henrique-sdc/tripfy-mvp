"""Token de push do aparelho e o tick interno do cron."""

from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from pydantic import BaseModel, ConfigDict, Field

from core.auth_middleware import CurrentUser, get_current_user
from core.config import settings
from core.rate_limit import limiter
from models.user import PushPlatform
from services import notification_service
from services.notification_rules import cron_secret_matches

me_router = APIRouter(prefix="/me", tags=["notifications"])
internal_router = APIRouter(
    prefix="/internal/notifications",
    include_in_schema=False,
)

_ME_RATE = "20/minute"
_TICK_RATE = "6/minute"


class RegisterPushTokenRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    token: str = Field(..., min_length=20, max_length=256)
    platform: PushPlatform
    timezone: str = Field(..., min_length=1, max_length=64)


class DeletePushTokenRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    token: str = Field(..., min_length=20, max_length=256)


class SupportPingRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    uid: str = Field(..., min_length=1, max_length=128)


def _require_cron_secret(header: str | None) -> None:
    if not cron_secret_matches(header, settings.NOTIFICATIONS_CRON_SECRET):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Segredo inválido.",
        )


@me_router.put("/push-token", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit(_ME_RATE)
async def register_push_token(
    request: Request,  # exigido pelo slowapi para identificar o IP
    body: RegisterPushTokenRequest,
    current_user: CurrentUser = Depends(get_current_user),
) -> Response:
    """Grava o ExpoPushToken deste aparelho. O client não escreve o Firestore."""
    await notification_service.register_push_token(
        current_user.uid,
        body.token,
        body.platform,
        body.timezone,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@me_router.delete("/push-token", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit(_ME_RATE)
async def delete_push_token(
    request: Request,  # exigido pelo slowapi para identificar o IP
    body: DeletePushTokenRequest,
    current_user: CurrentUser = Depends(get_current_user),
) -> Response:
    """Logout ou switch desligado: este aparelho sai da lista."""
    await notification_service.unregister_push_token(current_user.uid, body.token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@internal_router.post("/tick")
@limiter.limit(_TICK_RATE)
async def notifications_tick(
    request: Request,  # exigido pelo slowapi para identificar o IP
    x_cron_secret: Annotated[str | None, Header()] = None,
) -> dict[str, int]:
    """Cron externo, a cada 15 min. Sem Firebase Auth — o segredo é a trava."""
    _require_cron_secret(x_cron_secret)
    return await notification_service.run_tick()


@internal_router.post("/support")
@limiter.limit(_TICK_RATE)
async def notifications_support(
    request: Request,  # exigido pelo slowapi para identificar o IP
    body: SupportPingRequest,
    x_cron_secret: Annotated[str | None, Header()] = None,
) -> dict[str, int]:
    """Mesmo contrato de deep link, URL /help-support. Chamada manual na banca."""
    _require_cron_secret(x_cron_secret)
    sent = await notification_service.send_support_ping(body.uid)
    return {"sent": sent}
