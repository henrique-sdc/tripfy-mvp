"""
Schemas de avaliações da comunidade Tripfy por place_id Google.
"""
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class PlaceReviewCreate(BaseModel):
    """Corpo de POST /places/{place_id}/reviews."""

    model_config = ConfigDict(str_strip_whitespace=True)

    rating: int = Field(..., ge=1, le=5)
    comment: str = Field(..., min_length=1, max_length=500)

    @field_validator("comment")
    @classmethod
    def comment_not_blank(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Comentário não pode ser vazio.")
        return cleaned


class PlaceReviewResponse(BaseModel):
    """Review persistida em `place_reviews/{id}`."""

    id: str
    place_id: str
    user_uid: str
    rating: int = Field(..., ge=1, le=5)
    comment: str
    created_at: datetime
    updated_at: datetime | None = None
