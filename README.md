# Tripfy — MVP

App mobile de planejamento de viagens com IA. Frontend em React Native (Expo) e backend em Python (FastAPI).

**Máquina nova (Windows/Mac):** [docs/SETUP.md](docs/SETUP.md).

## Pré-requisitos

- **Node.js** 20+ (recomendado: LTS atual)
- **Python** 3.12+ (o projeto usa venv em `backend/venv/`)
- **Expo Go** no celular (para testar em device físico) ou emulador Android/iOS
- Conta no **Firebase** com Auth e Firestore habilitados

## Estrutura

```
tripfy-mvp/
├── backend/     # API FastAPI
└── frontend/    # App Expo (React Native)
```

## 1. Configurar variáveis de ambiente

### Backend (`backend/.env`)

Crie o arquivo a partir do modelo abaixo. O JSON do Firebase Admin SDK vai em `backend/firebase-adminsdk.json`

```env
ENVIRONMENT=development
GEMINI_API_KEY=sua_chave_gemini
FIREBASE_SERVICE_ACCOUNT_JSON_PATH=./firebase-adminsdk.json
GOOGLE_MAPS_API_KEY=sua_chave_google_maps
```

### Frontend (`frontend/.env`)

```env
EXPO_PUBLIC_FIREBASE_API_KEY=
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=
EXPO_PUBLIC_FIREBASE_PROJECT_ID=
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
EXPO_PUBLIC_FIREBASE_APP_ID=
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=
EXPO_PUBLIC_CARTO_API_KEY=
EXPO_PUBLIC_API_URL=http://SEU_IP_LOCAL:8000
```

> **Device físico (Expo Go):** `EXPO_PUBLIC_API_URL` precisa apontar para o IP da sua máquina na rede local (ex.: `http://192.168.1.10:8000`), não `localhost`. No celular, `localhost` é o próprio aparelho.

Para descobrir seu IP no Windows:

```bash
ipconfig
```

No macOS/Linux:

```bash
ip addr   # ou: ifconfig
```

## 2. Backend

```bash
cd backend

# Primeira vez: criar venv e instalar dependências
python -m venv venv
source venv/bin/activate        # Windows (Git Bash): source venv/Scripts/activate
pip install -r requirements.txt

# Subir a API (com reload e host 0.0.0.0 para o Expo Go alcançar)
./start.sh                      # Windows: start.bat
```

A API sobe em `http://0.0.0.0:8000`. Confira se está no ar:

```bash
curl http://localhost:8000/health
# {"status":"ok","environment":"development"}
```

Documentação interativa: `http://localhost:8000/docs`

## 3. Frontend

Em outro terminal:

```bash
cd frontend
npm install
npm start #ou npx expo start --clear
adb shell am start -W -a android.intent.action.VIEW -d "exp://ip:8081/--/match/código"
```

Com o Metro aberto:

- **Expo Go (celular):** escaneie o QR code
- **Android emulador:** `a`
- **iOS simulador (macOS):** `i`
- **Web:** `w`

## Rodar os dois ao mesmo tempo

| Terminal | Comando                    | URL                     |
| -------- | -------------------------- | ----------------------- |
| 1        | `cd backend && ./start.sh` | `http://localhost:8000` |
| 2        | `cd frontend && npm start` | Metro / Expo Dev Tools  |

## Problemas comuns

| Sintoma                               | Causa provável                                     | Correção                                                                                                                      |
| ------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| App não conecta na API no celular     | `EXPO_PUBLIC_API_URL` com `localhost`              | Use o IP da máquina na rede local                                                                                             |
| `EXPO_PUBLIC_API_URL não configurada` | `.env` ausente ou variável vazia                   | Preencha `frontend/.env` e reinicie o Metro                                                                                   |
| Backend não sobe                      | `firebase-adminsdk.json` ausente ou caminho errado | Baixe o JSON no Firebase Console e ajuste `FIREBASE_SERVICE_ACCOUNT_JSON_PATH`                                                |
| `429 Too Many Requests` do Gemini     | Quota do provedor estourada                        | No `backend/.env`: `LLM_PROVIDER=openai` + `OPENAI_API_KEY=sk-...` (ou volte com `LLM_PROVIDER=gemini`)                       |
| Cards sem foto / `Places … 403`       | Places API (New) desligada ou key bloqueada        | Habilite [Places API (New)](https://console.cloud.google.com/apis/library/places.googleapis.com) e libere na restrição da key |

## Stack

- **Frontend:** React Native, Expo Router, NativeWind (Tailwind v4), Firebase JS SDK, Zustand, i18next
- **Backend:** FastAPI, Firebase Admin SDK, Firestore, Pydantic
