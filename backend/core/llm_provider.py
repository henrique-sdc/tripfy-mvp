"""
Camada de abstração do provedor de LLM (PRD 2.5 — vendor lock-in mitigado).

Services/Use Cases importam apenas `LLMProvider` / `get_llm_provider`.
SDKs de vendor (`google.genai`, `openai`) ficam só neste módulo.

Troca de provedor: `LLM_PROVIDER=openai|gemini` no `.env` do backend.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from typing import Any

from core.config import settings
from core.prompt_engineering import SYSTEM_PROMPT
from loguru import logger
from models.trip import ItineraryDayResponse, ItineraryResponse

# Roteiro multi-dia com coords estoura fácil o default (~4k); gpt-4o-mini aguenta 16k.
_OPENAI_MAX_TOKENS = 16_384

# Keywords que a OpenAI strict rejeita/ignora — tiramos do schema Pydantic.
_OPENAI_STRIP_KEYS = frozenset(
    {
        "title",
        "default",
        "minimum",
        "maximum",
        "minItems",
        "maxItems",
        "minLength",
        "maxLength",
        "pattern",
        "format",
        "uniqueItems",
    }
)


def _openai_strict_schema(schema: dict[str, Any]) -> dict[str, Any]:
    """
    Pydantic → JSON Schema aceito por `strict: true` da OpenAI.

    Cuidado: `title` é metadata do JSON Schema E nome de campo nosso
    (dia/atividade). Só strippar metadata — nunca keys dentro de `properties`.
    """

    def fix(node: Any) -> Any:
        if not isinstance(node, dict):
            return node

        out: dict[str, Any] = {}
        for k, v in node.items():
            if k in _OPENAI_STRIP_KEYS:
                continue
            if k == "properties" and isinstance(v, dict):
                # Keys aqui são nomes de campo (ex.: title) — preservar.
                out[k] = {prop: fix(prop_schema) for prop, prop_schema in v.items()}
            else:
                out[k] = fix(v)

        if "anyOf" in out:
            out["anyOf"] = [fix(item) for item in out["anyOf"]]
        if out.get("type") == "object" or "properties" in out:
            props = out.get("properties") or {}
            out["additionalProperties"] = False
            out["required"] = list(props.keys())
        if out.get("type") == "array" and "items" in out:
            out["items"] = fix(out["items"])
        return out

    defs = schema.get("$defs", {})
    root = {k: v for k, v in schema.items() if k != "$defs"}
    fixed = fix(root)
    if defs:
        fixed["$defs"] = {name: fix(defn) for name, defn in defs.items()}
    return fixed


def _openai_day_keyed_schema(day_count: int) -> dict[str, Any]:
    """
    Schema com day_1..day_N obrigatórios.

    OpenAI NÃO aplica minItems/maxItems no array `days` — o modelo fecha com
    1 dia lotado. Com propriedades nomeadas + required, o strict força N dias.
    """
    if day_count < 1:
        raise ValueError("day_count deve ser >= 1")

    base = _openai_strict_schema(ItineraryResponse.model_json_schema())
    day_def = base["$defs"]["ItineraryDayResponse"]
    activity_def = base["$defs"]["ActivityResponse"]

    properties: dict[str, Any] = {
        "destination": {"type": "string"},
        "summary": {"type": "string"},
        "tips": {
            "type": "array",
            "items": {"type": "string"},
        },
    }
    required = ["destination", "summary", "tips"]
    for i in range(1, day_count + 1):
        key = f"day_{i}"
        properties[key] = {"$ref": "#/$defs/ItineraryDayResponse"}
        required.append(key)

    return {
        "type": "object",
        "properties": properties,
        "required": required,
        "additionalProperties": False,
        "$defs": {
            "ActivityResponse": activity_def,
            "ItineraryDayResponse": day_def,
        },
    }


def _keyed_json_to_itinerary(raw: str, day_count: int) -> ItineraryResponse:
    """Converte {day_1, day_2, ...} → ItineraryResponse com array `days`."""
    import json

    data = json.loads(raw)
    days: list[ItineraryDayResponse] = []
    for i in range(1, day_count + 1):
        key = f"day_{i}"
        if key not in data:
            raise ValueError(f"Resposta OpenAI sem {key}")
        day_payload = dict(data[key])
        day_payload["day"] = i
        days.append(ItineraryDayResponse.model_validate(day_payload))

    return ItineraryResponse(
        destination=data["destination"],
        summary=data["summary"],
        tips=[str(t) for t in (data.get("tips") or []) if str(t).strip()],
        days=days,
    )


class LLMProvider(ABC):
    """Interface trocável — OpenAI / Gemini sem tocar no Service."""

    @abstractmethod
    def generate_itinerary_stream(
        self,
        user_prompt: str,
        *,
        day_count: int,
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
        *,
        day_count: int,
    ) -> AsyncIterator[str]:
        from google.genai import types

        # day_count já vai no prompt; Gemini respeita bem o response_schema.
        _ = day_count
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
    Chat Completions com JSON Schema strict + streaming.

    Schema usa day_1..day_N (não array) — OpenAI ignora minItems.
    Acumula o stream, converte para ItineraryResponse e emite o JSON canônico
    (o front não consome tokens parciais no Wizard).
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
        *,
        day_count: int,
    ) -> AsyncIterator[str]:
        schema = _openai_day_keyed_schema(day_count)
        logger.info(
            "OpenAI structured output: day_count={} keys={}",
            day_count,
            [f"day_{i}" for i in range(1, day_count + 1)],
        )

        stream = await self._client.chat.completions.create(
            model=self._model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.5,
            max_tokens=_OPENAI_MAX_TOKENS,
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": "itinerary_response",
                    "strict": True,
                    "schema": schema,
                },
            },
            stream=True,
        )

        # Acumula o formato day_N; o app só entende o array `days` canônico.
        accumulated = ""
        async for chunk in stream:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta.content
            if delta:
                accumulated += delta

        itinerary = _keyed_json_to_itinerary(accumulated, day_count)
        payload = itinerary.model_dump_json()
        logger.info(
            "OpenAI convertido para ItineraryResponse: days={}",
            len(itinerary.days),
        )
        yield payload


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
    schema = _openai_day_keyed_schema(3)
    assert schema["required"] == [
        "destination",
        "summary",
        "tips",
        "day_1",
        "day_2",
        "day_3",
    ]
    assert "day_2" in schema["properties"]
    # Regressão: strip de metadata NÃO pode apagar o campo `title`.
    activity_props = schema["$defs"]["ActivityResponse"]["properties"]
    day_props = schema["$defs"]["ItineraryDayResponse"]["properties"]
    assert "title" in activity_props, "campo title da atividade sumiu do schema"
    assert "title" in day_props, "campo title do dia sumiu do schema"
    assert "title" in schema["$defs"]["ActivityResponse"]["required"]
    assert "title" in schema["$defs"]["ItineraryDayResponse"]["required"]
    assert "requires_ticket" in activity_props
    sample = (
        '{"destination":"X","summary":"Y","tips":["a","b","c"],'
        '"day_1":{"day":1,"title":"A","activities":[{"time":"09:00","title":"t",'
        '"description":"d","location":"l","latitude":null,"longitude":null}]},'
        '"day_2":{"day":2,"title":"B","activities":[{"time":"09:00","title":"t",'
        '"description":"d","location":"l","latitude":null,"longitude":null}]},'
        '"day_3":{"day":3,"title":"C","activities":[{"time":"09:00","title":"t",'
        '"description":"d","location":"l","latitude":null,"longitude":null}]}}'
    )
    converted = _keyed_json_to_itinerary(sample, 3)
    assert len(converted.tips) == 3
    assert len(converted.days) == 3
    assert converted.days[1].day == 2
    print("llm_provider ok")
