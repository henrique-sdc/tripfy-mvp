"""
Ponto de entrada da API Tripfy.
Executar com: uvicorn main:app --reload --port 8000
"""
import firebase_admin
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from firebase_admin import credentials

from core.config import settings

# Inicializa o Firebase Admin SDK uma única vez na subida da aplicação
# Em produção, a credencial virá de variável de ambiente, não de arquivo local
cred = credentials.Certificate(settings.FIREBASE_SERVICE_ACCOUNT_JSON_PATH)
firebase_admin.initialize_app(cred)

app = FastAPI(
    title="Tripfy API",
    description="Backend do app Tripfy — planejamento de viagens com IA",
    version="0.1.0",
)

# CORS: em desenvolvimento, permitir qualquer origem
# Em produção, restringir para os domínios reais do app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if settings.ENVIRONMENT == "development" else [],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    """Endpoint de saúde — usado para verificar se a API está no ar."""
    return {"status": "ok", "environment": settings.ENVIRONMENT}
