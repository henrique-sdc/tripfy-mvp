# Changelog — Tripfy Docs
## 2026-07-21 — Cutout Android (câmera) via build nativo

- Plugins `react-native-edge-to-edge` + `withAndroidDisplayCutout` (`shortEdges`).
- Expo Go **não** aplica isso — usar `npx expo run:android` no Pixel/Moto.
- Runtime: `StatusBar.setTranslucent` + Stack `statusBarTranslucent`.

## 2026-07-21 — Edge-to-edge: notch + gesture bar

- Status/nav transparentes (`androidStatusBar`, `expo-navigation-bar` `enforceContrast: false`).
- Root `useSystemBars` + tabs sem `sceneStyle` transparente; modais com `navigationBarTranslucent`.

## 2026-07-21 — Título da viagem ≠ destino

- Campo `title` (exibição) separado de `destination` (lugar real). Editar meta não sobrescreve o local.
- Cards na aba Viagens: título + linha `location` com o destino. Ver [[Detalhe da Viagem RF07]].

## 2026-07-21 — Wizard: Revisar vibe volta com form intacto

- "Revisar minha Vibe" abre `/edit-vibe` via push; save/back retorna ao wizard.
- Rascunho em memória (`wizardDraft`) preserva destino/dias/orçamento/notas se o modal remountar. Ver [[Home e Bottom Tabs]].

## 2026-07-21 — Review: editar/excluir no sheet + data/editada

- Comunidade no `PlaceDetailsSheet`: lápis + lixeira na própria review; data e badge "Editada".
- Minhas avaliações também mostram data/`Editada`. Ver [[Detalhe da Viagem RF07]].

## 2026-07-21 — Lixeira: swipe = apagar de vez

- Swipe/overswipe em `/trash` chama `purgeTrip` (só se `deleted_at` set) + limpa `trip_shares`. Ver [[Detalhe da Viagem RF07]].

## 2026-07-21 — Aba Viagens: cards premium + swipe

- `TripHistoryCard`: thumb Places (80×80), shimmer→fade, dias + tempo relativo; press spring 0.97.
- Lista com `FlatList`, pull-to-refresh, swipe Soft Delete (Mail/overswipe); empty CTA abre CreateTripSheet.
- Ver [[Home e Bottom Tabs]].

## 2026-07-21 — Nova parada com endereço → pin no mapa

- Campo opcional de endereço em `AddActivityModal`; lookup Places devolve `latitude`/`longitude` e a parada entra no mapa. Ver [[Detalhe da Viagem RF07]].

## 2026-07-21 — Swipe delete de parada = Home

- `SwipeableActivityRow` espelha `InviteBanner`: arrasta até o fim e solta → apaga (sem depender de toque na lixeira). Ver [[Detalhe da Viagem RF07]].

## 2026-07-20 — Título do dia editável + notas pessoais

- Toque no título do dia → `EditDayTitleModal`; toque em "Todos"/resumo abre meta.
- Campo `notes` na viagem (Firestore + API clone/get); linha de notas no detail + no `EditTripMetaModal`. Ver [[Detalhe da Viagem RF07]].


## 2026-07-20 — Dicas LLM no footer do roteiro

- `ItineraryResponse.tips[]` (3–5) geradas pela LLM por destino; card visual distinto no `/trip-detail`. Ver [[Geração de Roteiro RF06]].

## 2026-07-20 — Fase 3: Lixeira, reviews, clone, dicas

- Soft delete 30 dias (`deleted_at`) + `GET /trips/trash` + restore; telas `/trash` e `/my-reviews`.
- `POST /trips/{id}/clone` + deep link `tripfy://trip/{id}` + índice `trip_shares`.
- Footer Dicas Tripfy no detail. Ver [[Detalhe da Viagem RF07]].

## 2026-07-20 — Fase 2: Nova parada + dias + cross-day

- FAB abre `AddActivityModal`; chips `+ Dia`; lixeira no dia selecionado (reindex).
- EditActivityModal move parada entre dias (chips). Auto-save da Fase 1 cobre tudo. Ver [[Detalhe da Viagem RF07]].

## 2026-07-20 — Fase 1: Auto-save + Sync + Places Plus + DnD fix

- Auto-save no `/trip-detail` (debounce) + `<SyncIndicator>`; removido coração manual.
- Edit destino/resumo + description na parada; Places Details com `price_level` / `menu_uri`.
- Fix DnD: sem `GestureHandlerRootView` aninhado + handle de drag. Ver [[Detalhe da Viagem RF07]].

## 2026-07-20 — PlaceDetailsSheet + Social + Edit (frontend)

- Sheet Knowledge Panel (`PlaceDetailsSheet`): Sobre + Comunidade, reviews POST.
- Tap no card abre details; lápis edita time/title (`EditActivityModal`). Ver [[Detalhe da Viagem RF07]].

## 2026-07-20 — Place Details + Reviews Tripfy (backend)

- Lookup agora devolve `place_id`.
- `GET /places/{place_id}/details` — painel rico (New → legacy), até 5 fotos resolvidas.
- Reviews: `place_reviews` via Admin SDK; `GET/POST /places/{id}/reviews` + `DELETE …/me` (1 review por uid). Rules negam client. Ver [[Detalhe da Viagem RF07]].

## 2026-07-15 — Places 403: fallback legacy + troubleshooting

- `places_service`: se Places API (New) retorna 403, cai no Text Search clássico; foto via Location do redirect. Query do card prioriza `location`. Ver [[Detalhe da Viagem RF07]] e README.

## 2026-07-15 — Swipe + DnD + FAB (RF07 PASSO 3)

- `/trip-detail`: swipe-to-delete estilo Mail (`ReanimatedSwipeable` + overswipe), haptics no drag, FAB “Nova Parada” (Em breve). Ver [[Detalhe da Viagem RF07]].

## 2026-07-15 — ActivityCard + Places lazy load (RF07 PASSO 2)

- Frontend: `getPlaceDetails` em `lib/api.ts` + `ActivityCard` (shimmer, foto com fade, rating/`open_now`, fallback sem foto). Lista do `/trip-detail` usa os cards ricos. Ver [[Detalhe da Viagem RF07]].

## 2026-07-15 — Proxy Google Places (RF07 PASSO 1)

- Backend: `GET /api/v1/places/lookup` — Text Search (New) + foto resolvida (`photo_url`, `rating`, `reviews_count`, `open_now`). Chave `GOOGLE_MAPS_API_KEY` nunca vai ao app. Ver [[Detalhe da Viagem RF07]].

## 2026-07-15 — OpenAI multi-dia + chip Todos (RF06/RF07)

- Fix reforçado: schema OpenAI agora trava `days.minItems = days.maxItems = N` (N do pedido). Prompt limita a 4–6 atividades/dia pra não lotar só o dia 1. Ver [[Geração de Roteiro RF06]].
- Fix: GPT devolvia só o 1º dia — `OpenAIProvider` agora usa `strict: true` + schema adaptado + `max_tokens=16384`; prompt exige `days.length == N`. Ver [[Geração de Roteiro RF06]].
- Handoff do roteiro via `pendingItinerary` (não mais JSON na URL); aba Viagens abre só com `tripId`.
- `/trip-detail`: primeiro chip **Todos** (vista agregada; DnD só no dia individual).

## 2026-07-15 — Match de Viajantes: sessão e geração (RF11/RF12)

- Backend RF11/RF12 em [[Match de Viajantes RF11 RF12]].
  - `POST /api/v1/matches` cria sessão `waiting` com o UID autenticado.
  - `POST /api/v1/matches/{match_id}/join` adiciona o convidado em transação e muda para `generating`.
  - `GET /api/v1/matches/{match_id}` entrega resumo pré-join sem UIDs e visão completa aos participantes.
  - `POST /api/v1/matches/{match_id}/generate` busca os dois perfis, monta o prompt RF12 e transmite `ItineraryResponse` via SSE.
  - `generation_lock` transacional garante single-flight; o backend valida e persiste o roteiro antes de `completed`.
  - Frontend: Wizard reaproveitado em modo dupla, lobby `/match/[id]`, Share com `tripfy://`, `onSnapshot`, haptics e loading compartilhado com Solo.
  - Firestore permite apenas leitura participant-only de `matches`; escrita e listagem seguem bloqueadas.
  - Limite de dois participantes, preferências obrigatórias, rate limiting e erros HTTP padronizados.

## 2026-07-15 — Expansão da foto de perfil (Instagram-like)

- Toque no avatar expande com morph + blur; lápis → `/edit-profile`; toque no fundo fecha (mais rápido que a abertura). Ver `ProfilePhotoExpand`.

## 2026-07-15 — Polish perfil (avatar, CTA duplo, companheiros, nav)

- **Perfil estilo Instagram.** Ver [[Gerenciamento de Perfil RF03]].
  - Avatar ~96pt; CTAs lado a lado (Editar / Compartilhar — share "Em breve" até Match).
  - Companheiros: empty state, preview máx. 4, `/companions` via título `>`.
  - Fix animação de voltar (Android): sem `presentation: "card"`, `SystemUI` + ThemeProvider com `background`/`card` do tema, `animationDuration: 280`.
  - Sair da conta: confirmação + limpa `user`/`hasPreferences` no store.

## 2026-07-15 — Redesign Perfil + área de Configurações (RF03)

- **Perfil repaginado + Configurações nova.** Ver [[Gerenciamento de Perfil RF03]].
  - Fix flash branco no Dark Mode: `contentStyle` no `<Stack>` raiz (`_layout.tsx`).
  - Backend: `TravelPreferences.other_preferences` (texto livre, máx. 280) + incluído no prompt (`<perfil_viajante>`). Ver [[Preferências Sua Vibe]].
  - Novo `/edit-vibe`: reedita a vibe (reusa componentes do onboarding) + campo livre. `(onboarding)/preferences.tsx` não foi tocado.
  - Novo `/settings`: conta (editar perfil/vibe), notificações ("Em breve"), Ajuda & Suporte, sair da conta (logout inexistia antes), zona de perigo (movida de `edit-profile.tsx`).
  - Novo `/help-support`: FAQ curto, direitos LGPD, contato `mailto:`, aviso de Política/Termos em breve.
  - `profile.tsx`: engrenagem → Configurações; nome completo secundário; stats reais (roteiros criados via `getCountFromServer`, salvos via `wishlistStore`, matches "Em breve"); "Alterar" da vibe agora funcional.
  - `edit-profile.tsx`: botão "Remover foto"; zona de perigo removida (mudou de tela).
  - Confirmado: texto do botão "Cortar" do cropper Android não é customizável via `expo-image-picker` (UI nativa da lib).

## 2026-07-14 — RF03 perfil + exclusão LGPD

- **Gerenciamento de conta (RF03 / RN01).** Ver [[Gerenciamento de Perfil RF03]].
  - `lib/profile.ts`: get/update Auth+Firestore; delete cascata trips → user → Auth.
  - `/edit-profile`: foto (ImagePicker), nome/bio (RHF+Zod), zona de perigo.
  - Tab Perfil: dados reais + chips de `travel_preferences`; lápis → editar.

## 2026-07-14 — LLM trocável OpenAI/Gemini

- **Provedor LLM via `.env`.** Ver [[Geração de Roteiro RF06]].
  - `LLM_PROVIDER=openai|gemini` + `OpenAIProvider` (default) / `GeminiProvider`.
  - Keys: `OPENAI_API_KEY` / `OPENAI_MODEL` · `GEMINI_API_KEY` / `GEMINI_MODEL`.
  - Service/Router intactos — só a factory muda.

## 2026-07-14 (madrugada — fix mapa Expo Go + fitBounds)

- **Mapa não aparecia / zoom gigante no Expo Go (Android).** Ver [[Detalhe da Viagem RF07]].
  - Causa 1: `react-native-maps` fica bege (Expo removeu a API key Google compartilhada).
  - Causa 2: Leaflet no WebView inicializava com container de altura 0 → mapa branco.
  - Causa 3: `fitBounds` antes do tamanho real → zoom máximo; `invalidateSize` sozinho não reenquadra.
  - Fix em `TripOsmMap`: CARTO + `invalidateSize` + reaplicar `fitBounds`/`setView` nos timers; WebView `flex:1`, `baseUrl` https no Android.
  - Wiki RF07 atualizada (layout mapa+lista, sem toggle Google Maps).

## 2026-07-14 (madrugada — RF07 mapa + DnD)

- **RF07 — Detalhe da viagem com mapa e edição.** Ver [[Detalhe da Viagem RF07]].
  - Schema: `latitude`/`longitude` opcionais; prompt pede coords estimadas.
  - Observabilidade: log do JSON no fim do SSE + `console.info` no parse do app.
  - `/trip-detail`: toggle Lista/Mapa, DraggableFlatList, coração → Firestore `users/{uid}/trips`.

Registro cronológico de todas as inserções e modificações.

## 2026-07-14 (madrugada — RF06 Gemini + SSE)

- **RF06 full stack — geração de roteiro com IA.** Ver [[Geração de Roteiro RF06]].
  - **Backend:** `LLMProvider` / `GeminiProvider` (`google-genai`, `gemini-3.5-flash`), Structured Output (`ItineraryResponse`), `POST /api/v1/trips/generate` SSE, rate limit `5/minute`, prefs do Firestore, anti-injection + headroom.
  - **Frontend:** `generateTripStream` (`react-native-sse`), loading mágico no Wizard Solo, rota `/trip-detail`, i18n `wizard.generating.*` / `tripDetail.*`.
  - **Fora deste commit:** chamada HTTP ao Google Maps (estimativa só no prompt).

## 2026-07-14 (madrugada — polish commit)

- **Wiki sincronizada com o código do commit Home/Tabs/Wizard.** Ver [[Home e Bottom Tabs]].
  - Sheet premium (`RichChoiceCard`) + fix WARN Reanimated (entering no wrapper).
  - i18n: `createTrip.soloSubtitle`, `matchSubtitle`, `comingSoon`.
  - Home final: AiCommandBar (não Magic Card); ticket ≤7d; sem carrossel de próximas na Home.
  - `GestureHandlerRootView` no root e dentro do Modal do sheet.

## 2026-07-13 (noite — Wizard Solo)

- **RF05 — Wizard Solo + polish Home.** Ver [[Home e Bottom Tabs]].
  - `/wizard/solo`: destino, stepper dias, CapsuleSelector orçamento, notas, revisar vibe.
  - `CreateTripSheet` reescrito: sólido, timing curto, dismiss tap + drag.
  - Invite: swipe-to-delete estilo Alarmes iOS.
  - Em Alta `>` → `/trending`; Salvos com lixeira + confirmação.

## 2026-07-13 (noite — Home v2)

- **RF04 reinventado — Tabs + Home.** Ver [[Home e Bottom Tabs]].
  - Tab bar: Início | Salvos | **✨ FAB IA** | Viagens | Perfil.
  - `CreateTripSheet` (Solo / Match); `wishlistStore` liga coração → Salvos.
  - Home: ticket ≤7 dias, AI Command Bar, destinos da vibe, Em Alta (RF08).
  - Removido Explorar e carrossel de "próximas viagens" da Home.

## 2026-07-13 (noite — Home)

- **RF04 — Bottom Tabs + Home Screen.** Ver [[Home e Bottom Tabs]].
  - `NativeTabs` → `Tabs` + `FloatingTabBar` (Liquid Glass iOS / surface flutuante Android).
  - Home: saudação dinâmica + avatar, Magic Card (IA), banner de convite com pulse, carrossel de viagens, grade Explore.
  - Componentes: `FloatingTabBar`, `MagicCard`, `InviteBanner`; i18n `home.*` em `pt-BR.json`.
  - Ícones via Ionicons (PNGs do starter ausentes no repo).

## 2026-07-13 (noite)

- **RF02 — Recuperação de senha:** tela alinhada ao Design System Auth. Ver [[Recuperação de Senha]].
  - `forgot-password.tsx`: RHF + Zod, `FadeIn`/`FadeOut` no sucesso, botão desabilitado pós-envio.
  - `login.tsx`: link real via `AuthLink` → `/forgot-password`.
  - i18n: `auth.errors.emailRequired`, `forgotPasswordSubmitting`, `forgotPasswordSuccessHint`.
  - Copy anti-enumeration de e-mail (Firebase retorna sucesso mesmo se conta não existir).

## 2026-07-13 (tarde)

- **Tela "Sua Vibe" (preferências v2):** repaginação tátil completa. Ver [[Preferências Sua Vibe]].
  - Backend: enums expandidos (`Interest` 14 tags, `Pace`, `TransportMode`, `DietaryStyle`) em `TravelPreferences`.
  - Frontend: `InterestPill`, `PaceCard`, `CapsuleSelector`, CTA flutuante (barra sólida no Android; fade no iOS).
  - Copy de perfil habitual ("Como você costuma…"), não de viagem específica.
  - i18n: chaves `onboarding.vibe.*` em `pt-BR.json`.

## 2026-07-13

- **Design System Auth (Monochrome Premium):** refatoração visual das telas de autenticação. Ver [[Design System Auth]].
  - Paleta monochrome em `global.css` + espelho `constants/theme.ts`.
  - Componentes: `AppText`, `AuthLink`, `Button`, `Input`, `PasswordStrengthBar`, `SocialButton`.
  - **Fix Dark Mode Android:** `AppText` + `style.color` nativo (NativeWind v5 não propaga `text-text-*` ao `<Text>`).
  - Platform-aware: BlurView (iOS) vs superfície sólida / gradiente (Android) em slides e social login.
  - Formulários auth: `react-hook-form` + Zod (login, cadastro, recuperação); máscara DD/MM/AAAA no cadastro.
  - Telas: `(onboarding-slides)`, `(auth)/login`, `register`, `forgot-password`; i18n completo em `pt-BR.json`.
  - Missão rede (sessão anterior): `NetworkError`, `OfflineBanner`, backend `0.0.0.0`.

## 2026-07-12

- **Auth Full Stack (RF01 + Seção 3.3):** implementado o fluxo completo de autenticação. Ver [[Autenticação Full Stack]].
  - **Backend:** `core/firebase.py`, `core/auth_middleware.py`, `core/rate_limit.py`, `models/user.py`, `models/auth.py`, `repositories/user_repository.py`, `services/auth_service.py`, `api/auth_router.py`; rotas `/api/v1/auth/sync` e `/api/v1/auth/preferences` com rate limiting (10/min).
  - **Frontend:** `lib/firebase.ts` (persistência AsyncStorage), `lib/api.ts`, `lib/auth-errors.ts`, `lib/i18n.ts`, `locales/pt-BR.json`, `stores/authStore.ts` (Zustand), `hooks/useAuth.ts`; telas `(auth)/login`, `(auth)/register`, `(onboarding)/preferences`; navegação com `Stack.Protected`; tabs movidas para `(tabs)/`.
  - **Infra/segurança:** criado `firestore.rules` (users/{uid} restrito ao dono); `config.py` passou a declarar `GOOGLE_MAPS_API_KEY`; `global.css` com tokens `light-dark()` para Dark/Light Mode.
  - Novos pacotes frontend: `zustand`, `i18next`, `react-i18next`, `expo-localization`, `@react-native-async-storage/async-storage`.

## 2026-07-11

- **Frontend:** Configurado NativeWind v5 + Tailwind v4 no Expo SDK 57.
  - CSS centralizado em `frontend/src/global.css`
  - Import no layout raiz `frontend/src/app/_layout.tsx`
  - Wrappers `@/tw` para componentes com `className`
  - Removidos duplicatas em `frontend/app/` (Expo Router usa `src/app/`)
  - Ver [[NativeWind Setup]]
