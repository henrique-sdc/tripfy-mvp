"""
Configuração centralizada do ambiente via pydantic-settings.
Lê variáveis do arquivo .env automaticamente — nunca hardcode de segredos aqui.
"""
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Ambiente de execução (development | staging | production)
    ENVIRONMENT: str = "development"

    # Chave da API do provedor de IA (Gemini por padrão, trocável)
    GEMINI_API_KEY: str = ""

    # Caminho para o JSON de credenciais do Firebase Admin SDK
    FIREBASE_SERVICE_ACCOUNT_JSON_PATH: str = "./firebase-adminsdk.json"

    # Chave do Google Maps Platform (server-side apenas — nunca vai ao frontend)
    GOOGLE_MAPS_API_KEY: str = ""

    class Config:
        # Carrega automaticamente do arquivo .env na raiz do backend
        env_file = ".env"
        env_file_encoding = "utf-8"


# Instância única compartilhada — importe `settings` onde precisar
settings = Settings()
