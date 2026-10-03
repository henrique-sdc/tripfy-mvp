"""Chat de suporte com streaming SSE. Auth obrigatória."""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from loguru import logger

from core.auth_middleware import CurrentUser, get_current_user
from core.rate_limit import limiter
from core.sse import token_sse_stream
from models.support import SupportChatRequest
from services import support_service

router = APIRouter(prefix="/support", tags=["support"])

_CHAT_LIMIT = "10/minute"

_SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}


@router.post("/chat")
@limiter.limit(_CHAT_LIMIT)
async def support_chat(
    request: Request,
    body: SupportChatRequest,
    current_user: CurrentUser = Depends(get_current_user),
) -> StreamingResponse:
    """Responde dúvida do app em texto, token a token. Sem persistir a conversa."""
    try:
        token_stream = await support_service.support_chat_stream(
            current_user.uid,
            body,
        )
    except HTTPException:
        raise
    except RuntimeError as exc:
        logger.error("Provedor LLM indisponível: {}", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Serviço de suporte temporariamente indisponível.",
        ) from exc

    return StreamingResponse(
        token_sse_stream(
            token_stream,
            f"uid={current_user.uid}",
            error_message="Falha ao responder.",
            failure_log="Falha no streaming do suporte",
            log_body=False,
            success_log="Suporte respondido",
        ),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )
