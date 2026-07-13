"""
Inicialização única do Firebase Admin SDK e do client Firestore.

Centralizamos aqui porque middleware, repositories e (futuramente) outros
serviços precisam de um client Firestore pronto. Reinicializar o Admin SDK
em múltiplos lugares dispara `ValueError: The default Firebase app already
exists`, então garantimos uma única inicialização por processo.
"""
import firebase_admin
from firebase_admin import credentials, firestore
from loguru import logger

from core.config import settings

# O Admin SDK é um singleton global do processo. Só inicializamos se ainda
# não houver um app padrão registrado (evita erro em hot-reload do uvicorn).
if not firebase_admin._apps:
    cred = credentials.Certificate(settings.FIREBASE_SERVICE_ACCOUNT_JSON_PATH)
    firebase_admin.initialize_app(cred)
    logger.info("Firebase Admin SDK inicializado com sucesso.")

# Client Firestore síncrono compartilhado — importe `db` onde precisar.
# O acesso é encapsulado em run_in_threadpool nos repositories para não
# bloquear o event loop assíncrono do FastAPI.
db = firestore.client()
