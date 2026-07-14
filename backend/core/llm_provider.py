"""
Camada de abstração do provedor de LLM (PRD 2.5 — vendor lock-in mitigado).

Services/Use Cases importam apenas `LLMProvider` / `get_llm_provider`.
Nada de `google.genai` fora deste módulo.
"""
from abc import ABC, abstractmethod
from collections.abc import AsyncIterator

from google import genai
from google.genai import types
from loguru import logger

from core.config import settings
from core.prompt_engineering import SYSTEM_PROMPT
from models.trip import ItineraryResponse

# Modelo recomendado no PRD 2.5 para o lançamento.
_GEMINI_MODEL = "gemini-3.5-flash"


class LLMProvider(ABC):
    """Interface trocável — Gemini hoje, outro vendor amanhã sem tocar no Service."""

    @abstractmethod
    def generate_itinerary_stream(
        self,
        user_prompt: str,
    ) -> AsyncIterator[str]:
        """Yield de tokens textuais do roteiro (para SSE no router)."""
        ...


class GeminiProvider(LLMProvider):
    """
    Implementação concreta via SDK oficial `google-genai`.

    Nota: o pacote legado `google-generativeai` foi substituído pelo
    `google-genai` (já no requirements). Mantemos o mesmo contrato da interface.
    """

    def __init__(self, api_key: str | None = None) -> None:
        key = api_key if api_key is not None else settings.GEMINI_API_KEY
        if not key:
            raise RuntimeError(
                "GEMINI_API_KEY ausente — configure no .env do backend."
            )
        # Client único por instância; a chave nunca sai deste módulo.
        self._client = genai.Client(api_key=key)
        self._model = _GEMINI_MODEL
        logger.info("GeminiProvider inicializado com modelo={}", self._model)

    async def generate_itinerary_stream(
        self,
        user_prompt: str,
    ) -> AsyncIterator[str]:
        """
        Streaming assíncrono de JSON estruturado (ItineraryResponse).

        O Gemini emite fragmentos de JSON válidos só ao final; o frontend
        concatena os tokens SSE e faz o parse quando `done` chegar.
        """
        config = types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            temperature=0.5,
            # Structured Output nativo — trava o modelo no schema Pydantic.
            response_mime_type="application/json",
            response_schema=ItineraryResponse,
        )

        # `await` devolve o async iterator; o async for consome chunk a chunk.
        stream = await self._client.aio.models.generate_content_stream(
            model=self._model,
            contents=user_prompt,
            config=config,
        )

        async for chunk in stream:
            text = getattr(chunk, "text", None)
            if text:
                yield text


# Instância lazy — evita falhar na importação se a key ainda não estiver no env
# (ex.: health check / testes de módulo sem chamar o LLM).
_provider: LLMProvider | None = None


def get_llm_provider() -> LLMProvider:
    """Factory mínima: hoje só Gemini; amanhã troca aqui sem mexer no Service."""
    global _provider
    if _provider is None:
        _provider = GeminiProvider()
    return _provider
