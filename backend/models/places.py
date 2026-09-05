"""
Schemas do proxy Google Places (enriquecimento visual RF07).

A chave da API fica só no backend; o frontend recebe URLs públicas já resolvidas.
"""
from pydantic import BaseModel, Field


class PlaceDetailsResponse(BaseModel):
    """Detalhes leves de um local para cards do roteiro."""

    place_id: str | None = Field(
        default=None,
        description="ID Google Places (âncora p/ details e reviews Tripfy)",
    )
    photo_url: str | None = Field(
        default=None,
        description="URL pública da foto (já resolvida; sem API key na query)",
    )
    rating: float | None = Field(
        default=None,
        ge=0,
        le=5,
        description="Nota média Google (0–5)",
    )
    reviews_count: int | None = Field(
        default=None,
        ge=0,
        description="Total de avaliações (userRatingCount)",
    )
    open_now: bool | None = Field(
        default=None,
        description="Se está aberto agora (null se horário indisponível)",
    )
    # Opcional: Text Search já traz geometry — útil pra pin no mapa (nova parada).
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)


class PlaceAutocompleteItem(BaseModel):
    """Uma sugestão de Place Autocomplete (destino do wizard RF05)."""

    description: str = Field(..., min_length=1, max_length=120)
    place_id: str = Field(..., min_length=10, max_length=256)


class PlaceAutocompleteResponse(BaseModel):
    """Lista de sugestões — vazia é 200, não 404 (typeahead)."""

    predictions: list[PlaceAutocompleteItem] = Field(default_factory=list)


class PlaceFullDetailsResponse(BaseModel):
    """Painel rico do local (Knowledge Panel) — Place Details proxy."""

    place_id: str
    name: str | None = None
    formatted_address: str | None = None
    phone: str | None = None
    website: str | None = None
    editorial_summary: str | None = None
    weekday_text: list[str] = Field(default_factory=list)
    open_now: bool | None = None
    rating: float | None = Field(default=None, ge=0, le=5)
    reviews_count: int | None = Field(default=None, ge=0)
    photo_urls: list[str] = Field(
        default_factory=list,
        description="Até 5 fotos resolvidas (URLs públicas)",
    )
    latitude: float | None = None
    longitude: float | None = None
    price_level: str | None = Field(
        default=None,
        description='Faixa de preço estilo Maps (ex.: "$", "$$", "$$$")',
    )
    menu_uri: str | None = Field(
        default=None,
        description="URL do cardápio quando o Google expõe (raro; null se ausente)",
    )
