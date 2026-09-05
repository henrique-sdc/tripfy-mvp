# Setup Tripfy — máquina formatada

Ao terminar: API em `http://localhost:8000`, Metro do Expo no ar, emulador Android com o app, Firestore sem erro de permissão, Cursor lendo a wiki em `docs/obsidian`.

**Terminal no Windows: Git Bash.** Os blocos `bash` deste guia assumem isso. PowerShell quebra `source` e `./start.sh`.

Banco de dados = **Cloud Firestore** (Firebase). Não tem Postgres, Docker nem banco local para subir.

Repo: `https://github.com/henrique-sdc/tripfy-mvp.git`

---

## Passo 1 — BIOS e Windows

O emulador Android precisa de virtualização. Sem isso o AVD nem inicia.

1. Reinicie o PC e entre na BIOS/UEFI (Del, F2 ou F10, conforme a placa).
2. Ligue **Intel VT-x** ou **AMD-V** / SVM. Salve e saia.
3. No Windows, abra o PowerShell **como Administrador** e rode:

```powershell
Enable-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform,HypervisorPlatform -All
```

Windows 10/11 Pro: ligue também **Hyper-V** em “Ativar ou desativar recursos do Windows”, se aparecer.

4. Configurações → Sistema → **Para desenvolvedores** → ligue **Modo de desenvolvedor** (symlink do Node e USB debugging).
5. Reinicie o Windows. Só avance depois do reboot.

Confira no PowerShell:

```powershell
systeminfo | findstr /i "Hyper-V"
```

Se aparecer “Um hipervisor foi detectado”, virtualização está ok.

---

## Passo 2 — Instalar as ferramentas

Abra o **Prompt de Comando** ou PowerShell (ainda sem Git Bash: o Git ainda não existe). Instale nesta ordem. Depois de cada `winget`, se o instalador pedir reboot, aceite.

```powershell
winget install --id Microsoft.WindowsTerminal -e --accept-package-agreements --accept-source-agreements
winget install --id Git.Git -e --accept-package-agreements --accept-source-agreements
winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements
winget install --id Python.Python.3.12 -e --accept-package-agreements --accept-source-agreements
winget install --id Obsidian.Obsidian -e --accept-package-agreements --accept-source-agreements
winget install --id Google.AndroidStudio -e --accept-package-agreements --accept-source-agreements
```

**Python 3.12**, não 3.14. O `backend/requirements.txt` puxa `torch` e outros wheels que quebram em 3.14.

**Node:** LTS atual (20 ou 22). O frontend é Expo SDK 57 / React Native 0.81.

**Cursor:** baixe o instalador em [cursor.com](https://cursor.com) e instale. O `winget` do Cursor muda de id; o site é o caminho estável.

No instalador do **Git**:

- Editor: o que quiser (Cursor serve).
- PATH: **Git from the command line and also from 3rd-party software**.
- Terminal: marque **Git Bash Here**.
- Line endings: deixe o padrão.

Feche todos os terminais. Abra o **Windows Terminal** (ou Git Bash). Sem isso o PATH ainda aponta para o mundo pré-install.

### macOS (se for o caso)

```bash
brew install git node@22 python@3.12 watchman
brew install --cask obsidian android-studio cursor
brew install --cask zulu@17
```

Xcode (App Store) + `xcode-select --install` só entram no Passo 14, e só em Mac.

---

## Passo 3 — Conferir o PATH

No Git Bash:

```bash
git --version
node -v          # v20.x ou v22.x
npm -v
py -3.12 --version   # Windows. No Mac: python3.12 --version
```

Se `node` ou `py` der “command not found”, feche o terminal e abra de novo. Se persistir, reinstale pelo `winget` e marque “Add to PATH”.

Instale o Firebase CLI **depois** do Node:

```bash
npm install -g firebase-tools
firebase --version
```

---

## Passo 4 — Clonar o repositório

Escolha uma pasta curta. No Windows, evite `Documentos` com OneDrive (o `node_modules` sofre). Exemplo: `C:\dev`.

```bash
mkdir -p /c/dev
cd /c/dev
git clone https://github.com/henrique-sdc/tripfy-mvp.git
cd tripfy-mvp
```

Repo privado: o GitHub pede login. No browser, ou:

```bash
gh auth login
```

(`gh` = GitHub CLI. Sem ele, clone pelo HTTPS e cole um Personal Access Token no prompt de senha.)

A partir daqui, **todo comando** assume que você está em `tripfy-mvp/` ou num subdiretório anunciado (`cd backend`, `cd frontend`).

---

## Passo 5 — Cursor

1. Abra o Cursor → **File → Open Folder** → a pasta `tripfy-mvp` (a raiz, não `frontend/`).
2. Settings (`Ctrl+,`) → busque `Terminal › Integrated: Default Profile Windows` → **Git Bash**.
3. Settings → `Format On Save`: ligue.

O repo já traz regras em `.cursor/rules/`. Elas carregam sozinhas. Não precisa copiar nada para “User Rules”.

### Extensões

Instale pelo painel Extensions (`Ctrl+Shift+X`):

| Extensão                                                | Para quê                                                             |
| ------------------------------------------------------- | -------------------------------------------------------------------- |
| ESLint (`dbaeumer.vscode-eslint`)                       | Lint do frontend (`frontend/eslint.config.js`, `eslint-config-expo`) |
| Python (`ms-python.python`)                             | venv, syntax, run                                                    |
| Tailwind CSS IntelliSense (`bradlc.vscode-tailwindcss`) | classes NativeWind / Tailwind v4                                     |

Não tem Prettier no repo. Não instale “formatar com Prettier” como default: o frontend usa ESLint. Não tem Ruff no backend; não adicione só porque é moda.

Lint na mão:

```bash
cd frontend
npm run lint
```

### MCP do Obsidian (a IA lê a wiki)

A wiki do projeto é a pasta `docs/obsidian`. O Cursor fala com ela pelo plugin **Local REST API** do Obsidian (endpoint MCP em `http://127.0.0.1:27123/mcp/`).

1. Abra o **Obsidian**.
2. **Open folder as vault** → `tripfy-mvp/docs/obsidian` (caminho absoluto, ex.: `C:\dev\tripfy-mvp\docs\obsidian`).
3. Settings → Community plugins → ligue Community plugins → Browse → instale **Local REST API** (coddingtonbear) → Enable.
4. Settings → **Local REST API**:
   - ligue **Enable Non-encrypted (HTTP) Server** (porta **27123**);
   - copie a **API Key** (não commite essa chave).
5. Deixe o Obsidian **aberto** com esse vault. Sem o app rodando, o MCP cai.

No Cursor, crie o arquivo `.cursor/mcp.json` na raiz do repo (já está no `.gitignore`; não vai para o Git):

```json
{
  "mcpServers": {
    "obsidian": {
      "url": "http://127.0.0.1:27123/mcp/",
      "headers": {
        "Authorization": "Bearer COLE_A_API_KEY_AQUI"
      }
    }
  }
}
```

Reinicie o Cursor. Settings → MCP: o servidor `obsidian` precisa ficar verde. Se ficar vermelho: Obsidian aberto? HTTP 27123 ligado? Bearer igual à key do plugin?

A IA passa a ter `vault_read` / `vault_search` na wiki (`wiki/`, `changelog.md`, `index.md`).

---

## Passo 6 — Android Studio e emulador

Você **não** abre o Tripfy dentro do Android Studio. O Studio existe para o SDK, o `adb` e o AVD. O app roda no Expo.

1. Abra o Android Studio. Wizard: **Standard**. Aceite as licenças. Espere o SDK baixar.
2. **More Actions → SDK Manager** (ou Settings → Languages & Frameworks → Android SDK).

**SDK Platforms** (mostre package details):

- Android 16.0 (API 36) → Android SDK Platform 36

**SDK Tools**:

- Android SDK Build-Tools
- Android SDK Platform-Tools
- Android Emulator
- Intel x86 Emulator Accelerator **ou** Android Emulator hypervisor driver (o wizard escolhe conforme a CPU)

SDK Location padrão no Windows: `%LOCALAPPDATA%\Android\Sdk`  
(`C:\Users\SEU_USER\AppData\Local\Android\Sdk`)

3. Variáveis de ambiente (Windows GUI): Configurações → Sistema → Sobre → Configurações avançadas do sistema → Variáveis de Ambiente → **do usuário**:

| Variável       | Valor                                         |
| -------------- | --------------------------------------------- |
| `ANDROID_HOME` | `C:\Users\SEU_USER\AppData\Local\Android\Sdk` |

Em **Path** (usuário), adicione:

```
%ANDROID_HOME%\platform-tools
%ANDROID_HOME%\emulator
```

Feche o Git Bash e abra de novo.

```bash
adb --version
emulator -list-avds
```

### Criar o AVD

1. Android Studio → **More Actions → Virtual Device Manager** → **Create Device**.
2. Hardware: **Pixel 8** (ou Pixel 7). Next.
3. System image: uma com ícone da **Play Store** (Google Play), API 35 ou 36, **x86_64** (Intel/AMD) ou **arm64-v8a** (se o gerenciador oferecer e a CPU for ARM). Download se pedir. Next → Finish.
4. No Device Manager, clique **Play**. Espere chegar na home do Android (primeiro boot demora).

```bash
adb devices
```

Tem que listar `emulator-5554` (ou similar) como `device`. Se aparecer `unauthorized`, aceite o diálogo de USB debugging **dentro** do emulador.

O Metro instala o Expo Go quando você aperta `a`. Não precisa da Play Store no AVD, mas a imagem Google Play evita dor de cabeça com Google Maps / serviços.

### macOS — PATH do SDK

No `~/.zshrc`:

```bash
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools
```

```bash
source ~/.zshrc
```

---

## Passo 7 — Contas e chaves (fora do repo)

Nada disso vai para o Git. Você precisa de acesso ao projeto Firebase do Tripfy (peça para ser colaborador) ou de um projeto seu para desenvolver.

### Firebase Console

1. [console.firebase.google.com](https://console.firebase.google.com) → o projeto do app.
2. **Authentication** → Sign-in method → **E-mail/senha** → Enable.
3. **Firestore Database** → se ainda não existe, Create (produção ou modo teste; as regras do repo é que mandam depois).
4. **Storage** → Get started (foto de perfil).
5. Ícone de engrenagem → **Project settings** → **Your apps** → app **Web**. Copie:

- `apiKey`
- `authDomain`
- `projectId`
- `storageBucket`
- `messagingSenderId`
- `appId`

6. Mesma tela → aba **Service accounts** → **Generate new private key**. Salve o JSON. No Passo 8 ele vira `backend/firebase-adminsdk.json`.

### Google AI / OpenAI (roteiro)

O backend troca de LLM por env. Default no código: **`LLM_PROVIDER=openai`**.

- OpenAI: [platform.openai.com/api-keys](https://platform.openai.com/api-keys) → `OPENAI_API_KEY`
- Gemini (fallback): [aistudio.google.com/apikey](https://aistudio.google.com/apikey) → `GEMINI_API_KEY` e `LLM_PROVIDER=gemini`

### Google Maps Platform (Places no backend)

1. [Google Cloud Console](https://console.cloud.google.com/) → o mesmo projeto do Firebase (ou o que vocês usam para Maps).
2. APIs & Services → Library → ligue **Places API (New)**. Sem isso o app toma 403 nos cards de foto.
3. Credentials → API key. Essa key é **server-side**: vai no `.env` do backend (`GOOGLE_MAPS_API_KEY`). Restrinja por API (Places) no console.

O mapa da tela de viagem no Expo Go usa **CARTO + OSM**, não essa key nativa. Mesmo assim o backend precisa da Places para enriquecer paradas.

### CARTO (tiles do mapa no app)

Chave gratuita: [carto.com/basemaps/apikey](https://carto.com/basemaps/apikey) → `EXPO_PUBLIC_CARTO_API_KEY`. Sem ela o mapa mostra watermark “API KEY REQUIRED”.

### Key nativa do Maps (build EAS / `expo run:android`)

`EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` no frontend. No Expo Go o mapa nativo fica bege; o app usa Leaflet na WebView. Essa key só importa em binário nativo.

---

## Passo 8 — Arquivos `.env` e o Admin SDK

Crie os dois arquivos. Não existem `.env.example` no repo; o modelo é este.

### `backend/firebase-adminsdk.json`

Copie o JSON baixado no Passo 7 para:

```
tripfy-mvp/backend/firebase-adminsdk.json
```

O `.gitignore` já ignora esse arquivo. O backend lê o caminho em `FIREBASE_SERVICE_ACCOUNT_JSON_PATH` (default `./firebase-adminsdk.json`, relativo à pasta `backend/`).

### `backend/.env`

```env
ENVIRONMENT=development
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.1-pro-preview
FIREBASE_SERVICE_ACCOUNT_JSON_PATH=./firebase-adminsdk.json
GOOGLE_MAPS_API_KEY=AIza...
```

Para Gemini no lugar da OpenAI:

```env
LLM_PROVIDER=gemini
GEMINI_API_KEY=...
```

### `frontend/.env`

No Git Bash, IP da máquina na LAN:

```bash
ipconfig | grep -A 4 "Wi-Fi"
```

Use o `IPv4` (ex.: `192.168.1.10`). No emulador Android, `10.0.2.2` é o `localhost` do seu PC.

```env
EXPO_PUBLIC_FIREBASE_API_KEY=
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=
EXPO_PUBLIC_FIREBASE_PROJECT_ID=
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
EXPO_PUBLIC_FIREBASE_APP_ID=
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=
EXPO_PUBLIC_CARTO_API_KEY=
EXPO_PUBLIC_API_URL=http://10.0.2.2:8000
```

| Onde o app roda                       | `EXPO_PUBLIC_API_URL`   |
| ------------------------------------- | ----------------------- |
| Emulador Android                      | `http://10.0.2.2:8000`  |
| Celular físico (Expo Go, mesmo Wi-Fi) | `http://SEU_IPV4:8000`  |
| Web no PC (`w` no Metro)              | `http://localhost:8000` |

`localhost` no **celular** é o próprio aparelho. A API nunca responde lá.

Toda mudança em `EXPO_PUBLIC_*` exige **reiniciar o Metro** (`Ctrl+C`, `npx expo start -c`).

---

## Passo 9 — Deploy das regras do Firestore

O client SDK (login, perfil, trips no aparelho) obedece `firestore.rules`. Sem o deploy, o app toma `permission-denied`. O Admin SDK do backend ignora essas regras.

Na **raiz** do repo (`tripfy-mvp/`, onde está o `firebase.json`):

```bash
cd /c/dev/tripfy-mvp
firebase login
firebase use --add
```

Escolha o projeto Firebase do Passo 7. Isso cria um `.firebaserc` local (pode ficar fora do Git).

```bash
firebase deploy --only firestore:rules
```

Tem que terminar com o deploy do `firestore.rules`. Se pedir billing/Blaze, o Firestore no Spark aguenta o MVP; o CLI avisa se a conta estiver no plano errado.

---

## Passo 10 — Backend (FastAPI)

O `requirements.txt` inclui `torch`, `transformers`, `onnxruntime`. A primeira instalação baixa **vários GB**. Deixe rodar.

```bash
cd /c/dev/tripfy-mvp/backend
py -3.12 -m venv venv
source venv/Scripts/activate
pip install --upgrade pip
pip install -r requirements.txt
```

macOS / Linux:

```bash
python3.12 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

No Mac, `pywin32` (está no lock Windows) pode falhar. Se o pip parar nele, instale o resto; esse pacote só existe no Windows.

Com o venv **ativado**:

```bash
./start.sh
```

Windows sem Git Bash: `start.bat` (cmd).

O script sobe:

```text
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

`0.0.0.0` é obrigatório: celular na LAN e emulador precisam alcançar a API. `127.0.0.1` só aceita o próprio PC.

Outro terminal (ou o browser):

```bash
curl http://localhost:8000/health
```

Esperado: `{"status":"ok","environment":"development"}`.

Docs interativa: [http://localhost:8000/docs](http://localhost:8000/docs)

Windows Firewall: na primeira subida, “Permitir acesso” para Python na rede privada.

Se o uvicorn morrer falando de `firebase-adminsdk.json` ou `Certificate`: o JSON está no lugar errado ou o `.env` aponta para outro path.

---

## Passo 11 — Frontend (Expo)

Deixe o backend rodando. Abra **outro** Git Bash.

```bash
cd /c/dev/tripfy-mvp/frontend
npm install
npx expo start -c
```

`-c` limpa o cache do Metro. Use na primeira vez e depois de mexer em `.env` ou NativeWind.

Com o emulador **já na home** (Passo 6):

- aperte `a` no terminal do Metro → instala/abre Expo Go no AVD.

Outras teclas: `w` web, `i` simulador iOS (só Mac).

Celular físico: instale **Expo Go** (Play Store / App Store), mesmo Wi-Fi do PC, escaneie o QR. `EXPO_PUBLIC_API_URL` tem que ser o IPv4 da máquina, e o `start.sh` já está em `0.0.0.0`.

Confira no app: tela de login, cadastro com e-mail (Firebase Auth). Se o Firestore não foi deployado (Passo 9), o sync do perfil falha com permissão.

---

## Passo 12 — Deep links no emulador (ADB)

O scheme do app é `tripfy`. No Expo Go o link vira `exp://HOST:PORT/--/caminho`.

Path correto: `/match/ID`, `/trip/ID`, `/profile/UID`. Formato `tripfy://match/ID` (host no meio) o Expo interpreta errado e pode abrir `profile/[id]`.

Com Metro no ar e o emulador ligado:

```bash
adb devices
adb shell am start -W -a android.intent.action.VIEW -d "exp://127.0.0.1:8081/--/match/COLE_O_ID"
```

Troque `127.0.0.1:8081` pelo host:porta que o Metro imprimiu (`exp://192.168.x.x:8081`). O ID é o da sala Match (Firestore `matches/{id}`).

Se o emulador não resolver o IP da LAN:

```bash
adb reverse tcp:8081 tcp:8081
adb reverse tcp:8000 tcp:8000
```

Aí o `exp://127.0.0.1:8081/--/match/...` e o `EXPO_PUBLIC_API_URL=http://10.0.2.2:8000` fecham o circuito.

---

## Passo 13 — Dois terminais no dia a dia

| Terminal | Comando                                                    | Pronto quando                   |
| -------- | ---------------------------------------------------------- | ------------------------------- |
| 1        | `cd backend && source venv/Scripts/activate && ./start.sh` | `curl localhost:8000/health` ok |
| 2        | `cd frontend && npx expo start -c`                         | QR / aperte `a`                 |
| Obsidian | vault `docs/obsidian` aberto                               | MCP verde no Cursor             |

---

## Passo 14 — iOS

**Mac:** Xcode da App Store, aceite a license (`sudo xcodebuild -license`), depois `i` no Metro (simulador) ou device USB.

**Windows:** não tem simulador iOS. Binário no iPhone = EAS (nuvem). Guia: `docs/obsidian/wiki/Build iOS EAS iPhone.md`.

---

## Está no ar quando

- [ ] `curl http://localhost:8000/health` devolve `ok`
- [ ] `npx expo start -c` abre o Metro; `a` abre o Tripfy no AVD
- [ ] Login/cadastro e-mail funciona
- [ ] Firestore sem `permission-denied` (regras deployadas)
- [ ] Gerar um roteiro solo não cai em 503 (chave OpenAI ou Gemini no `.env` do backend)
- [ ] Cursor MCP `obsidian` verde com o vault aberto

---

## Problemas comuns

| Sintoma                                         | Causa                                 | Correção                                                                       |
| ----------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------ |
| App no celular não fala com a API               | `EXPO_PUBLIC_API_URL` com `localhost` | IPv4 da máquina; Metro `-c`                                                    |
| `EXPO_PUBLIC_API_URL não configurada`           | `.env` ausente ou Metro velho         | Preencha `frontend/.env`, `npx expo start -c`                                  |
| Backend não sobe / erro de certificado Firebase | JSON ausente                          | `backend/firebase-adminsdk.json` + path no `.env`                              |
| `permission-denied` no Firestore                | Regras não deployadas                 | `firebase deploy --only firestore:rules`                                       |
| `429` do Gemini                                 | quota                                 | `LLM_PROVIDER=openai` + `OPENAI_API_KEY`                                       |
| Cards sem foto / Places 403                     | Places API (New) off ou key restrita  | Ligue a API; libere a key                                                      |
| Mapa com watermark CARTO                        | key vazia                             | `EXPO_PUBLIC_CARTO_API_KEY` + Metro `-c`                                       |
| `adb` não encontrado                            | PATH                                  | Passo 6; novo Git Bash                                                         |
| AVD: “VT-x is disabled” / “WHPX”                | BIOS ou feature Windows               | Passo 1                                                                        |
| `npm install` path too long                     | Windows MAX_PATH                      | Modo de desenvolvedor; clone em `C:\dev`                                       |
| pip explode no `torch` / Python 3.14            | versão errada                         | `py -3.12 -m venv venv` e reinstale                                            |
| MCP Obsidian vermelho                           | app fechado ou key velha              | Abra o vault; cole a API Key nova no `mcp.json`                                |
| Kaspersky / ECONNRESET no npm ou EAS            | inspeção TLS                          | Kaspersky → não verificar conexões criptografadas (já aconteceu neste projeto) |
| Metro no emulador instala Expo Go e trava       | primeiro boot                         | espere a home do Android; `adb devices` = `device`                             |

---

## Mapa do repo

```
tripfy-mvp/
├── backend/                 # FastAPI, venv, .env, firebase-adminsdk.json
│   ├── start.sh / start.bat
│   ├── requirements.txt
│   └── core/config.py       # variáveis que o .env precisa cobrir
├── frontend/                # Expo 57, NativeWind v5
│   ├── package.json
│   ├── app.json / app.config.js
│   └── .env                 # só EXPO_PUBLIC_*
├── firebase.json
├── firestore.rules
├── docs/SETUP.md            # este arquivo
└── docs/obsidian/           # vault da wiki (MCP)
```
