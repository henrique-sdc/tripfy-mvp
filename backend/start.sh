#!/usr/bin/env bash
# Sobe o backend em 0.0.0.0 — obrigatório para que dispositivos físicos na
# mesma rede (celular via Expo Go) consigam alcançar a API. Rodar em
# 127.0.0.1 (padrão do uvicorn) só aceita conexões da própria máquina.
set -e
cd "$(dirname "$0")"
uvicorn main:app --reload --host 0.0.0.0 --port 8000
