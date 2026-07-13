"""
Limiter compartilhado do slowapi (Seção 6.2 — defesa contra força bruta/DDoS).

Fica isolado aqui para que tanto o main.py (registro de state e handler de erro)
quanto os routers (decorators @limiter.limit) usem a MESMA instância.

ponytail: por enquanto o limiter usa storage em memória (padrão do slowapi),
o que só conta requisições por processo. Ao escalar para múltiplos workers,
migrar para storage Redis (REDIS_URL já previsto no .env — Seção 7.2).
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

# Chave por IP de origem — limita tentativas por cliente.
limiter = Limiter(key_func=get_remote_address)
