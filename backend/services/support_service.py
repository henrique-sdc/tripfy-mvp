"""
Chat de suporte. KB estática no system prompt — sem banco vetorial.

O Service só fala com LLMProvider. Não grava a conversa.
"""

from collections.abc import AsyncIterator
from pathlib import Path

from loguru import logger

from core.llm_provider import LLMProvider, get_llm_provider
from core.prompt_engineering import build_support_system, wrap_support_turn
from models.support import SupportChatRequest

_KB_PATH = Path(__file__).resolve().parents[1] / "knowledge" / "support_kb.md"
# ponytail: a KB inteira vai no system prompt. Acima de 8 KB, fatiar por tema
# (ou retrieval) — injetar o arquivo todo deixa de caber barato.
_KB_MAX_BYTES = 8 * 1024


def parse_support_kb(raw: str) -> str:
    size = len(raw.encode("utf-8"))
    if size > _KB_MAX_BYTES:
        raise RuntimeError(
            f"support_kb.md tem {size} bytes — teto {_KB_MAX_BYTES}. Fatiar por tema."
        )
    text = raw.strip()
    if not text:
        raise RuntimeError("support_kb.md vazio.")
    return text


def load_support_kb() -> str:
    return parse_support_kb(_KB_PATH.read_text(encoding="utf-8"))


# Falha na subida se o arquivo estiver vazio ou acima do teto.
load_support_kb()


async def support_chat_stream(
    uid: str,
    request: SupportChatRequest,
    provider: LLMProvider | None = None,
) -> AsyncIterator[str]:
    """Monta o system com a KB e devolve o stream de texto livre."""
    turns = [
        (item.role, wrap_support_turn(item.role, item.content))
        for item in request.messages
    ]
    logger.info(
        "Suporte solicitado: uid={} msgs={} chars={}",
        uid,
        len(request.messages),
        sum(len(item.content) for item in request.messages),
    )
    llm = provider or get_llm_provider()
    # Relê o arquivo: o uvicorn não observa .md, e a base muda sem reinício.
    return llm.stream_support(build_support_system(load_support_kb()), turns)
