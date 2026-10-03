"""Empacotamento SSE compartilhado pelo roteiro e pelo suporte."""
import json
from collections.abc import AsyncIterator

from loguru import logger


async def token_sse_stream(
    token_stream: AsyncIterator[str],
    log_context: str,
    *,
    error_message: str,
    failure_log: str,
    log_body: bool,
    success_log: str,
) -> AsyncIterator[str]:
    """Converte fragmentos de texto do LLM em eventos `{token|done|error}`."""
    accumulated = ""
    try:
        async for token in token_stream:
            accumulated += token
            yield f"data: {json.dumps({'token': token}, ensure_ascii=False)}\n\n"
        if log_body:
            logger.info("{} [{}]: {}", success_log, log_context, accumulated)
        else:
            # Suporte: não gravar o texto (pode ter dado pessoal).
            logger.info(
                "{} [{}] chars={}",
                success_log,
                log_context,
                len(accumulated),
            )
        yield f"data: {json.dumps({'done': True})}\n\n"
    except Exception as exc:
        # O protocolo precisa avisar o cliente porque os headers já foram enviados.
        logger.exception("{} [{}]: {}", failure_log, log_context, exc)
        yield f"data: {json.dumps({'error': error_message}, ensure_ascii=False)}\n\n"


async def itinerary_sse_stream(
    token_stream: AsyncIterator[str],
    log_context: str,
) -> AsyncIterator[str]:
    """Converte fragmentos JSON do LLM em eventos SSE e sinaliza o término."""
    async for event in token_sse_stream(
        token_stream,
        log_context,
        error_message="Falha ao gerar roteiro.",
        failure_log="Falha no streaming do roteiro",
        log_body=True,
        success_log="Roteiro gerado com sucesso",
    ):
        yield event
