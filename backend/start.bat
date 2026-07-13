@echo off
REM Sobe o backend em 0.0.0.0 — obrigatorio para que dispositivos fisicos na
REM mesma rede (celular via Expo Go) consigam alcancar a API. Rodar em
REM 127.0.0.1 (padrao do uvicorn) so aceita conexoes da propria maquina.
cd /d "%~dp0"
uvicorn main:app --reload --host 0.0.0.0 --port 8000
