"""
Ponto de entrada da API Tripfy.
Executar com: uvicorn main:app --reload --port 8000
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

# `import core.firebase` inicializa o Admin SDK uma única vez na subida da app.
import core.firebase  # noqa: F401
from api.auth_router import router as auth_router
from api.trip_router import router as trip_router
from core.config import settings
from core.rate_limit import limiter

app = FastAPI(
    title="Tripfy API",
    description="Backend do app Tripfy — planejamento de viagens com IA",
    version="0.1.0",
)

# Rate limiting global (slowapi): registra o limiter no state e o handler que
# devolve 429 quando o limite por IP é estourado (Seção 6.2).
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS: em desenvolvimento, permitir qualquer origem
# Em produção, restringir para os domínios reais do app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if settings.ENVIRONMENT == "development" else [],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rotas versionadas sob /api/v1
app.include_router(auth_router, prefix="/api/v1")
app.include_router(trip_router, prefix="/api/v1")


@app.get("/health")
async def health_check():
    """Endpoint de saúde — usado para verificar se a API está no ar."""
    return {"status": "ok", "environment": settings.ENVIRONMENT}
