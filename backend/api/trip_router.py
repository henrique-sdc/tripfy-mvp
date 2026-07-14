"""
Rotas de viagem — geração de roteiro via IA (RF06).

Resposta em SSE (text/event-stream): o app consome token a token,
sem esperar o roteiro completo (PRD 3.2 / RN05).
"""
import json
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from loguru import logger

from core.auth_middleware import CurrentUser, get_current_user
from core.rate_limit import limiter
from models.trip import GenerateTripRequest
from services import trip_service

router = APIRouter(prefix="/trips", tags=["trips"])

# Geração custa token de API Key — limite mais agressivo que o de auth (PRD 6.2).
_RATE_LIMIT = "5/minute"


async def _sse_event_stream(
    token_stream: AsyncIterator[str],
) -> AsyncIterator[str]:
    """
    Empacota tokens no formato SSE.

    JSON no campo data evita quebra de protocolo se o modelo emitir \\n.
    Evento final `done` sinaliza ao cliente que o stream terminou limpo.
    """
    try:
        async for token in token_stream:
            yield f"data: {json.dumps({'token': token}, ensure_ascii=False)}\n\n"
        yield f"data: {json.dumps({'done': True})}\n\n"
    except Exception as exc:
        # Erro no meio do stream: avisa o cliente sem derrubar o worker opaco.
        logger.exception("Falha no streaming do roteiro: {}", exc)
        yield f"data: {json.dumps({'error': 'Falha ao gerar roteiro.'})}\n\n"


@router.post("/generate")
@limiter.limit(_RATE_LIMIT)
async def generate_trip(
    request: Request,  # exigido pelo slowapi para identificar o IP
    body: GenerateTripRequest,
    current_user: CurrentUser = Depends(get_current_user),
) -> StreamingResponse:
    """
    Gera roteiro personalizado com streaming SSE.

    Body: destination, days, budget, notes.
    Preferências de perfil vêm do Firestore (não do frontend).
    """
    logger.info(
        "Geração de roteiro solicitada: uid={} destino={} dias={}",
        current_user.uid,
        body.destination,
        body.days,
    )

    try:
        token_stream = await trip_service.generate_itinerary_stream(
            current_user.uid,
            body,
        )
    except HTTPException:
        raise
    except RuntimeError as exc:
        # Tipicamente GEMINI_API_KEY ausente — 503 evita vazar detalhe de config.
        logger.error("Provedor LLM indisponível: {}", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Serviço de geração temporariamente indisponível.",
        ) from exc

    return StreamingResponse(
        _sse_event_stream(token_stream),
        media_type="text/event-stream",
        headers={
            # Evita buffering intermediário em proxies / CDN.
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
