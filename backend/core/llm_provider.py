"""
Camada de abstração do provedor de LLM (PRD 2.5 — vendor lock-in mitigado).

Services/Use Cases importam apenas `LLMProvider` / `get_llm_provider`.
SDKs de vendor (`google.genai`, `openai`) ficam só neste módulo.

Troca de provedor: `LLM_PROVIDER=openai|gemini` no `.env` do backend.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator

from core.config import settings
from core.prompt_engineering import SYSTEM_PROMPT
from loguru import logger
from models.trip import ItineraryResponse


class LLMProvider(ABC):
    """Interface trocável — OpenAI / Gemini sem tocar no Service."""

    @abstractmethod
    def generate_itinerary_stream(
        self,
        user_prompt: str,
    ) -> AsyncIterator[str]:
        """Yield de tokens textuais do roteiro (para SSE no router)."""
        ...


class GeminiProvider(LLMProvider):
    """Structured Output nativo via SDK `google-genai`."""

    def __init__(self, api_key: str | None = None) -> None:
        # Import lazy: quem usa só OpenAI não precisa carregar o SDK Google.
        from google import genai

        key = api_key if api_key is not None else settings.GEMINI_API_KEY
        if not key:
            raise RuntimeError("GEMINI_API_KEY ausente — configure no .env do backend.")
        self._client = genai.Client(api_key=key)
        self._model = settings.GEMINI_MODEL
        logger.info("GeminiProvider inicializado com modelo={}", self._model)

    async def generate_itinerary_stream(
        self,
        user_prompt: str,
    ) -> AsyncIterator[str]:
        from google.genai import types

        config = types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            temperature=0.5,
            response_mime_type="application/json",
            response_schema=ItineraryResponse,
        )

        stream = await self._client.aio.models.generate_content_stream(
            model=self._model,
            contents=user_prompt,
            config=config,
        )

        async for chunk in stream:
            text = getattr(chunk, "text", None)
            if text:
                yield text


class OpenAIProvider(LLMProvider):
    """
    Chat Completions com JSON Schema + streaming.

    Mesmo contrato SSE do Gemini: fragmentos de JSON que o app remonta no `done`.
    """

    def __init__(self, api_key: str | None = None) -> None:
        from openai import AsyncOpenAI

        key = api_key if api_key is not None else settings.OPENAI_API_KEY
        if not key:
            raise RuntimeError("OPENAI_API_KEY ausente — configure no .env do backend.")
        self._client = AsyncOpenAI(api_key=key)
        self._model = settings.OPENAI_MODEL
        logger.info("OpenAIProvider inicializado com modelo={}", self._model)

    async def generate_itinerary_stream(
        self,
        user_prompt: str,
    ) -> AsyncIterator[str]:
        # json_schema (sem strict) aceita o schema Pydantic com optional/null.
        # O frontend já valida destination + days no parse do SSE.
        stream = await self._client.chat.completions.create(
            model=self._model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.5,
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": "itinerary_response",
                    "schema": ItineraryResponse.model_json_schema(),
                },
            },
            stream=True,
        )

        async for chunk in stream:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta


# Instância lazy — evita falhar na importação se a key ainda não estiver no env.
_provider: LLMProvider | None = None


def get_llm_provider() -> LLMProvider:
    """Factory: lê `LLM_PROVIDER` e instancia o concreto. Service não muda."""
    global _provider
    if _provider is None:
        name = (settings.LLM_PROVIDER or "").strip().lower()
        if name == "openai":
            _provider = OpenAIProvider()
        elif name == "gemini":
            _provider = GeminiProvider()
        else:
            raise RuntimeError(
                f"LLM_PROVIDER inválido: {settings.LLM_PROVIDER!r}. "
                "Use 'openai' ou 'gemini'."
            )
    return _provider


# ponytail: check mínimo — falha se a factory/hierarquia quebrar.
if __name__ == "__main__":
    assert issubclass(GeminiProvider, LLMProvider)
    assert issubclass(OpenAIProvider, LLMProvider)
    print("llm_provider ok")
