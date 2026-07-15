"""Empacotamento SSE compartilhado pelas gerações Solo e Match."""
import json
from collections.abc import AsyncIterator

from loguru import logger


async def itinerary_sse_stream(
    token_stream: AsyncIterator[str],
    log_context: str,
) -> AsyncIterator[str]:
    """Converte fragmentos JSON do LLM em eventos SSE e sinaliza o término."""
    accumulated = ""
    try:
        async for token in token_stream:
            accumulated += token
            yield f"data: {json.dumps({'token': token}, ensure_ascii=False)}\n\n"
        logger.info(
            "Roteiro gerado com sucesso [{}]: {}",
            log_context,
            accumulated,
        )
        yield f"data: {json.dumps({'done': True})}\n\n"
    except Exception as exc:
        # O protocolo precisa avisar o cliente porque os headers já foram enviados.
        logger.exception("Falha no streaming do roteiro [{}]: {}", log_context, exc)
        yield f"data: {json.dumps({'error': 'Falha ao gerar roteiro.'})}\n\n"
