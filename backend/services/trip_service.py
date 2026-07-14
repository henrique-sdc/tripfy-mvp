"""
Use Case de geração de roteiro (RF06).

Orquestra: Firestore (perfil) + engenharia de prompt + LLM abstrato.
O Service NÃO importa o SDK do Google — só a interface LLMProvider.
"""
from collections.abc import AsyncIterator

from fastapi import HTTPException, status
from headroom import compress
from loguru import logger

from core.llm_provider import LLMProvider, get_llm_provider
from core.prompt_engineering import build_user_prompt
from models.trip import GenerateTripRequest
from repositories import user_repository


async def generate_itinerary_stream(
    uid: str,
    request: GenerateTripRequest,
    provider: LLMProvider | None = None,
) -> AsyncIterator[str]:
    """
    Busca personalidade no Firestore, monta o prompt e devolve o stream do LLM.

    `provider` é injetável para testes; em produção usa get_llm_provider().
    """
    user = await user_repository.get_user(uid)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuário não encontrado. Faça sync em /auth/sync primeiro.",
        )

    if user.travel_preferences is None:
        # Sem vibe salva, o roteiro sairia genérico — forçamos o onboarding.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Complete as preferências de viagem antes de gerar um roteiro.",
        )

    user_prompt = build_user_prompt(request, user.travel_preferences)

    # Headroom comprime o payload do usuário antes de gastar tokens no Gemini
    # (regra do projeto — custo variável da API Key, PRD Seção 7).
    compressed = compress([{"role": "user", "content": user_prompt}])
    final_prompt = compressed.messages[0]["content"]
    logger.info(
        "Prompt comprimido para geração: uid={} destino={} dias={} "
        "tokens_before={} tokens_after={} ratio={:.2f}",
        uid,
        request.destination,
        request.days,
        compressed.tokens_before,
        compressed.tokens_after,
        compressed.compression_ratio,
    )

    llm = provider or get_llm_provider()
    return llm.generate_itinerary_stream(final_prompt)
