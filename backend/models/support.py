"""Payload do chat de suporte. O system prompt nunca vem do cliente."""

from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

# Teto por caracteres (~4 chars/token). Sem tiktoken.
_MAX_MESSAGE_CHARS = 800
_MAX_HISTORY = 8
_MAX_TOTAL_CHARS = 4000


class SupportMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=_MAX_MESSAGE_CHARS)

    @field_validator("content")
    @classmethod
    def strip_content(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Mensagem vazia.")
        return cleaned


class SupportChatRequest(BaseModel):
    messages: list[SupportMessage] = Field(..., min_length=1, max_length=_MAX_HISTORY)

    @model_validator(mode="after")
    def check_history(self) -> "SupportChatRequest":
        total = sum(len(item.content) for item in self.messages)
        if total > _MAX_TOTAL_CHARS:
            raise ValueError("Histórico longo demais.")
        if self.messages[-1].role != "user":
            raise ValueError("A última mensagem precisa ser do usuário.")
        return self
