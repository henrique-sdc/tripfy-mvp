---
tags:
  - frontend
  - expo
  - eas
  - ios
  - dispositivo-fisico
data_criacao: 2026-08-30
status: ativo
---

# Build iOS no iPhone (EAS, PC Windows)

Como instalar o Tripfy nativo no iPhone a partir de um **PC Windows**. Não tem Xcode neste setup: o binário iOS nasce na nuvem ([EAS Build](https://docs.expo.dev/build/introduction/)). Cabo USB no Windows **não** instala o app.

Relacionado: [[Home e Bottom Tabs]] (Expo Go vs binário nativo).

Conta Expo, bundle id e Team Apple ficam no dashboard / `app.json` — não copie handles nem UUIDs pra wiki.

> [!warning] Rede primeiro
> Sem estes dois ajustes o CLI cai com `ECONNRESET` (npm, GraphQL da Expo, upload). Foi o que travou o primeiro build neste PC.
>
> 1. **Kaspersky** — Configurações de rede → Verificação de conexões criptografadas → **Não verificar conexões criptografadas**. O antivírus quebra TLS com `registry.npmjs.org` e `api.expo.dev`.
> 2. **Wi‑Fi do roteador ASUS** — neste ambiente o roteador bloqueia algo do fluxo. Liga o **hotspot do celular** no PC e segue. Quando a rede está ok, `npm view lodash version` responde na hora; se isso já der `ECONNRESET`, não adianta insistir no `eas build`.

## O que você precisa

- Apple Developer Program (US$ 99/ano) **ativa** em [developer.apple.com/account](https://developer.apple.com/account) (não Pending).
- Conta Expo (login no CLI).
- iPhone na mesma rede que o PC **depois** do IPA instalado (hotspot serve).
- Pasta `frontend/` — sempre rode os comandos EAS daqui.

**Apple ID** no prompt do EAS = e-mail da conta Apple (iCloud / App Store / developer.apple.com). **Não** é o ID de equipe.

Dois modos:

|                  | Expo Go | Development build (este guia)          |
| ---------------- | ------- | -------------------------------------- |
| Ícone            | Expo Go | Tripfy                                 |
| Assinatura Apple | Não     | Sim (Ad Hoc + UDID)                    |
| Rebuild nativo   | Não     | Só se mudar plugin / `app.json` nativo |

## Config no repo (já feito)

Não crie certificado `.p12` na mão. A EAS gera e guarda.

- `app.json`: `ios.bundleIdentifier`, `ios.infoPlist.ITSAppUsesNonExemptEncryption: false`, `extra.eas.projectId` (o CLI precisa do projectId no repo; não é token).
- `app.config.js`: **exporta o objeto Expo na raiz** (`return expo`), não `{ expo }`. Com o wrapper o `eas-cli` lê `ios`/`extra` como `undefined` e explode em `projectId` ou `ITSAppUsesNonExemptEncryption`.
- `eas.json`: profile `development` (`developmentClient: true`, `distribution: internal`).
- `expo-dev-client` nas dependências.

`ios.buildNumber` no `app.json` o EAS ignora se `cli.appVersionSource` é `remote`. Aviso inofensivo.

## Do zero (máquina nova)

Rede: Kaspersky + hotspot, como no callout acima.

```bash
cd frontend
npx eas-cli@latest --version
npx eas-cli@latest login
```

`eas` sozinho dá `command not found` se não instalou global. Use `npx eas-cli@latest …`.

Se o projeto EAS ainda não existir:

```bash
npx eas-cli@latest build:configure
```

Se o link falhar com `Cannot read properties of undefined (reading 'projectId')`, o projeto **já foi criado** no dashboard. Confirme `extra.eas.projectId` no `app.json` e siga. Não apague o projeto na Expo para “começar de novo”.

Primeiro build iOS:

```bash
npx expo install expo-dev-client   # se ainda não estiver no package.json
npx eas-cli@latest build --platform ios --profile development
```

Prompts (respostas que funcionaram aqui):

1. Criptografia só padrão/HTTPS? **yes** (grava `ITSAppUsesNonExemptEncryption`).
2. Logar na Apple? **yes**. E-mail + senha + 2FA (device/SMS).
3. Gerar Distribution Certificate? **yes** na primeira vez. Nas seguintes: **reuse** o certificado existente (não gera outro).
4. Registrar devices? **yes** → Website. No **iPhone**, Safari: abre o link `https://expo.dev/register-device/…`, instala o perfil. Só então volta no PC e aperta uma tecla.
5. Select devices: marca o iPhone (UDID tipo `00008110-…`).

O CLI cria o perfil Ad Hoc com esse UDID. Sem device na lista a Apple não deixa instalar o IPA.

## Instalar no iPhone

1. No iPhone, Safari: link **Install** da página do build (QR do terminal também vale).
2. Se pedir confiança: Ajustes → Geral → VPN e gerenciamento de dispositivo → confiar no certificado do time.
3. Abre o app **Tripfy** (não o Expo Go).

## Rodar o JS no dia a dia

PC e iPhone na mesma rede (hotspot ok). Backend com `EXPO_PUBLIC_API_URL` = IP da máquina, não `localhost`. Ver o README.

```bash
cd frontend
npx expo start --dev-client --clear
```

O Metro mostra `Using development build`. Abre o Tripfy no celular; ele puxa `exp+tripfy://…` no IP do PC. Mudança de JS/UI não precisa de novo EAS. Rebuild nativo só se mudar plugin, bundle id, ou lib nativa.

## Trajetória real deste PC (2026-08-30)

O que falhou, na ordem, e o que era:

| Sintoma                                                                          | Causa                                               | O que fazer                                                                            |
| -------------------------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `npm install -g eas-cli` / `npx eas-cli` → `ECONNRESET` no registry.npmjs.org    | Kaspersky (HTTPS inspection) e/ou Wi‑Fi ASUS        | Desliga verificação criptografada; hotspot                                             |
| `eas: command not found`                                                         | CLI só via npx                                      | `npx eas-cli@latest`                                                                   |
| `build:configure` cria o projeto na Expo e depois `reading 'projectId'`          | `app.config.js` com `{ expo }`                      | `return expo`; `projectId` no `app.json`                                               |
| `reading 'ITSAppUsesNonExemptEncryption'`                                        | Mesmo bug do config + CLI tentando gravar o plist   | Flag já no `app.json`; export na raiz                                                  |
| `Failed to set up credentials` + GraphQL `ECONNRESET` **depois** do QR de device | Rede caiu no meio; certificado Apple **já** existia | Registrar o iPhone no link; repetir `eas build`                                        |
| GraphQL `ECONNRESET` de novo no retry                                            | Ainda na rede ruim                                  | Hotspot; só então o build sobe                                                         |
| Aviso Maps `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ausente` no EAS                      | `eas-cli` às vezes não carrega o `.env`             | O Metro (`expo start`) carrega. Para IPA, use EAS Secrets se o mapa nativo nascer bege |

Quando deu certo: session Apple restaurada do Keychain, **reuse** do cert `ID`, device iPhone já na lista, perfil Ad Hoc `ID`, upload 4.2 MB, `Build finished`, install pelo link do build.

> [!tip]
> TestFlight (`eas submit`) é outro caminho (90 dias por build, app TestFlight). Para o dono do iPhone, Ad Hoc + dev client cobre o dia a dia.
