---
tags:
  - setup
  - onboarding
  - toolchain
  - firebase
  - expo
data_criacao: 2026-09-04
status: ativo
---

# SETUP

Guia de **máquina formatada** (Windows primeiro; Mac onde o comando muda). Comandos copiáveis: `docs/SETUP.md` na pasta `docs/` do repo (fora deste vault, um nível acima).

Banco = Cloud Firestore. Não sobe Postgres nem Docker.

Relacionado: [[Autenticação Full Stack]], [[NativeWind Setup]], [[Geração de Roteiro RF06]], [[Match de Viajantes RF11 RF12]], [[Build iOS EAS iPhone]].

> [!warning] Terminal no Windows
> Git Bash. PowerShell quebra `source` e `./start.sh`.

## Sequência (não pule)

1. BIOS: VT-x / AMD-V. Windows: Virtual Machine Platform + Hypervisor Platform. Reboot.
2. `winget`: Git, Node LTS, **Python 3.12** (não 3.14), Obsidian, Android Studio. Cursor pelo site. `npm i -g firebase-tools`.
3. `git clone https://github.com/henrique-sdc/tripfy-mvp.git` — abrir a **raiz** no Cursor.
4. Cursor: Git Bash como terminal default. Extensões: ESLint, Python, Tailwind CSS IntelliSense. Sem Prettier no repo; sem Ruff no backend.
5. Obsidian: vault = pasta `docs/obsidian`. Plugin **Local REST API**. HTTP porta **27123**. `.cursor/mcp.json` (gitignored) aponta para `http://127.0.0.1:27123/mcp/` com `Authorization: Bearer <API Key>`. Obsidian fica aberto.
6. Android Studio: SDK API 36, `ANDROID_HOME`, AVD Pixel 8 **Google Play**. O projeto **não** abre no Studio; o Studio só entrega `adb` + emulador. Metro: tecla `a`.
7. Firebase Console: Auth e-mail, Firestore, Storage, JSON Admin SDK → `backend/firebase-adminsdk.json`. Web config → `frontend/.env` (`EXPO_PUBLIC_FIREBASE_*`).
8. LLM: default `LLM_PROVIDER=openai` em `backend/core/config.py`. Places API (New) + `GOOGLE_MAPS_API_KEY` no backend. CARTO: `EXPO_PUBLIC_CARTO_API_KEY`.
9. Na raiz: `firebase login` → `firebase use --add` → `firebase deploy --only firestore:rules`.
10. `backend/`: `py -3.12 -m venv venv` → `source venv/Scripts/activate` → `pip install -r requirements.txt` → `./start.sh`. Health: `curl http://localhost:8000/health`.
11. `frontend/`: `npm install` → `npx expo start -c`. Emulador: `EXPO_PUBLIC_API_URL=http://10.0.2.2:8000`. Celular: IPv4 da máquina, nunca `localhost`.
12. Deep link Expo Go: `adb shell am start -W -a android.intent.action.VIEW -d "exp://127.0.0.1:8081/--/match/ID"` (path `/match/…`, não `tripfy://match/id`).

iOS no Windows: [[Build iOS EAS iPhone]].

## Arquivos que não vão para o Git

- `backend/.env`
- `backend/firebase-adminsdk.json`
- `frontend/.env`
- `.cursor/mcp.json`
