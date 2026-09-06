# Log — Tripfy Wiki

## [2026-09-05] update | Paywall Light/Dark

`PaywallScreen` usa `useTheme()`. Halo e cards no tema; texto no CTA é branco.
[[Tripfy Pro e Paywall]], [[changelog]].

## [2026-09-05] ingest | Tripfy Pro e Paywall

Mock Freemium do TCC: entitlement no Firestore, `POST /trips`, checkout `/upgrade` `/cancel`, overlay `PaywallScreen`.
[[Tripfy Pro e Paywall]], [[Autenticação Full Stack]], [[Detalhe da Viagem RF07]], [[Gerenciamento de Perfil RF03]] e [[changelog]].

## [2026-09-05] update | Prefs no SSR do Expo web

AsyncStorage no-op quando `Platform.OS === 'web'` e não há `window`.
[[changelog]].

## [2026-09-05] update | Contador de Matches no Perfil

`countTripStats()` no `lib/trips.ts`. Mesma origem do filtro da aba Viagens.
[[Gerenciamento de Perfil RF03]] e [[changelog]].

## [2026-09-05] update | Filtro Todos / Matches na aba Viagens

Pílulas no header. `match_id` no auto-save pós-Match; clone não herda.
[[Home e Bottom Tabs]], [[Match de Viajantes RF11 RF12]] e [[changelog]].

## [2026-09-05] update | Tema e idioma nas Configurações

`themeMode` + `locale` no `preferencesStore`. Tema default = sistema.
Sistema → `setColorScheme('unspecified')`; `useTheme` ignora null.
[[Gerenciamento de Perfil RF03]] e [[changelog]].

## [2026-09-05] update | Skyscanner deep link

Path deixa de ser `voos-para-{cidade}`. Usa `saoa` + entity ID + datas YYMMDD.
[[Afiliados RF10]] e [[changelog]].

## [2026-09-05] ingest | Afiliados RF10

Smart Deep Links (Booking / Skyscanner / GetYourGuide). Datas da viagem
persistidas; `requires_ticket` no prompt. Amadeus fora. [[Afiliados RF10]],
[[Geração de Roteiro RF06]], [[Detalhe da Viagem RF07]] e [[changelog]].

## [2026-09-05] update | Giro do sparkle na geração

`MagicalGenerating` troca o spinner linear por wind-up + volta lenta (~1.8s) + pausa.
Mola em 360° dava tontura. [[Geração de Roteiro RF06]] e [[changelog]].

## [2026-09-05] update | Autocomplete de destino no wizard

Proxy `GET /places/autocomplete` (New → legacy). Wizard Solo exige toque numa
sugestão Google (Em Alta = `curated`). [[Detalhe da Viagem RF07]],
[[Home e Bottom Tabs]] e [[changelog]].

## [2026-09-04] update | Toggle de vibração nas Configurações

Preferência do aparelho em `/settings`. Wrapper `@/lib/haptics`; lixeira ignora o
toggle. [[Gerenciamento de Perfil RF03]] e [[changelog]].

## [2026-09-04] update | Sheet do roteiro e DnD no iPhone

Layout RF07: mapa full-bleed + sheet maximizável. Handle de drag 44pt fora do
Pressable da foto. [[Detalhe da Viagem RF07]] e [[changelog]].

## [2026-09-04] update | Tab indicator e swipe Alarmes

Indicador da tab: timing sem quique. `SwipeToDelete` reescrito em Pan (commit em 55%,
lixeira acompanha). Atualizados [[Liquid Glass e Vidro Nativo]] e [[changelog]].

## [2026-09-04] ingest | Liquid Glass e vidro nativo

Criada [[Liquid Glass e Vidro Nativo]]: escada iOS 26 / iOS 16.4 / Android no `GlassSurface`, a
armadilha do `className` morto em componentes nativos e o `SwipeToDelete` unificado. Nota de
alerta cruzada em [[NativeWind Setup]]. Atualizados [[index]] e [[changelog]].

## [2026-09-04] ingest | SETUP máquina formatada

Criada [[SETUP]] (resumo no vault) e `docs/SETUP.md` (comandos). Atualizados [[index]] e [[changelog]].

## [2026-08-30] update | CARTO API key no mapa

Tiles Leaflet passam `EXPO_PUBLIC_CARTO_API_KEY`. Ver [[Detalhe da Viagem RF07]] e [[changelog]].

## [2026-08-30] update | Fundo dark #0B1014

`--color-background` dark e `Colors.dark.background`: `#000000` → `#0B1014`. Ver [[Design System Auth]] e [[changelog]].

## [2026-08-30] ingest | Build iOS EAS iPhone

Criada [[Build iOS EAS iPhone]] a partir do terminal (Kaspersky TLS + hotspot ASUS + EAS Ad Hoc). Atualizados [[index]] e [[changelog]].

## [2026-08-30] update | EAS app.config.js

Export do config na raiz; EAS não crasha mais no infoPlist. Ver [[changelog]].

## [2026-08-30] update | Bundle ID iOS

`ios.bundleIdentifier` no `app.json` para EAS. Ver [[changelog]].

## [2026-08-30] update | Nome do app Tripfy e Imagem

`expo.name` em `app.json` passou a Tripfy e imagens alteradas em assets. Ver [[changelog]].

## [2026-08-15] update | Auth web/SSR persistence

`getReactNativePersistence` só no nativo. Atualizados [[Autenticação Full Stack]] e [[changelog]].

## [2026-07-21] update | Rede de Companheiros Passo 2

Front: Share, `profile/[id]`, lista hidratada. Atualizados [[Rede de Companheiros]], [[Gerenciamento de Perfil RF03]], [[changelog]].

## [2026-07-21] ingest | Rede de Companheiros

Criada [[Rede de Companheiros]], atualizados [[index]], [[Gerenciamento de Perfil RF03]] e [[changelog]].

## [2026-07-21] update | Lixeira purge swipe

Atualizado [[Detalhe da Viagem RF07]]: swipe na lixeira apaga de vez (`purgeTrip`). Changelog no mesmo tema.

## [2026-07-21] update | Aba Viagens cards premium

Atualizado [[Home e Bottom Tabs]]: TripHistoryCard, swipe soft-delete, pull-to-refresh, empty CTA. Changelog no mesmo tema.

## [2026-07-20] update | Fase 3 Ecossistema usuário

Atualizado [[Detalhe da Viagem RF07]]: soft-delete/lixeira, minhas reviews, clone/share, trip_shares, footer dicas. Changelog no mesmo tema.

## [2026-07-20] update | Fase 2 Gerenciamento roteiro

Atualizado [[Detalhe da Viagem RF07]]: AddActivityModal, +Dia, excluir dia, mover parada entre dias via modal. Changelog no mesmo tema.

## [2026-07-20] update | Fase 1 Auto-save Sync Places DnD

Atualizado [[Detalhe da Viagem RF07]]: auto-save, SyncIndicator, price_level/menu_uri, fix GestureHandlerRootView aninhado. Changelog no mesmo tema.

## [2026-07-20] update | PlaceDetailsSheet frontend PASSO 2

Atualizado [[Detalhe da Viagem RF07]]: sheet Sobre/Comunidade, edit time/title, api client. Changelog no mesmo tema.

## [2026-07-20] update | Place Details + Reviews backend

Atualizado [[Detalhe da Viagem RF07]]: `place_id` no lookup, `GET …/details`, reviews Firestore `place_reviews`, rules deny client. Changelog no mesmo tema.

## [2026-07-15] update | Swipe DnD FAB RF07 PASSO 3

Atualizado [[Detalhe da Viagem RF07]]: ReanimatedSwipeable, overswipe delete, haptics DnD, FAB stub. Changelog no mesmo tema.

## [2026-07-15] update | ActivityCard Places lazy load RF07 PASSO 2

Atualizado [[Detalhe da Viagem RF07]]: `getPlaceDetails`, `ActivityCard`, cache de sessão, i18n openNow. Changelog no mesmo tema.

## [2026-07-15] update | Proxy Google Places RF07 PASSO 1

Atualizado [[Detalhe da Viagem RF07]] com `GET /api/v1/places/lookup` (Places API New, photo URI sem key). Changelog no mesmo tema.

## [2026-07-15] ingest | OpenAI multi-dia + chip Todos

Atualizados [[Geração de Roteiro RF06]] (strict OpenAI + stash) e [[Detalhe da Viagem RF07]] (chip Todos). Changelog no mesmo tema.

## [2026-07-14] ingest | Detalhe da Viagem RF07 + coords + observability

Criada [[Detalhe da Viagem RF07]]. Atualizados schema (lat/lng), prompt, logs SSE e `/trip-detail` (mapa + DnD + save). Ver também [[Geração de Roteiro RF06]].

## [2026-07-14] ingest | Geração de Roteiro RF06 (Gemini + SSE)

Reescrita completa de [[Geração de Roteiro RF06]] com frontmatter, callouts e cobertura backend+frontend. Index já apontava a página. Changelog consolidado no mesmo tema.

Registro cronológico (append-only) das operações da base de conhecimento.

## [2026-07-12] ingest | Autenticação Full Stack (RF01 + Seção 3.3)

Criada a página [[Autenticação Full Stack]] documentando o fluxo de auth completo (backend FastAPI + frontend Expo). Atualizado o [[index]] e o [[changelog]].

## [2026-07-13] ingest | Design System Auth + fix Dark Mode Android

Criada [[Design System Auth]] com paleta Monochrome Premium, componentes UI, regra de blindagem de cor nativa no Android e padrão Liquid Glass (iOS) vs sólido (Android). Documentado fix do bug `text-text-*` ilegível no dark mode via `AppText` / `AuthLink`. Atualizados [[index]] e [[changelog]].

## [2026-07-13] ingest | Preferências "Sua Vibe" v2

Criada [[Preferências Sua Vibe]] — modelo expandido (pace, transport, dietary, 14 interesses), UI tátil com haptics/spring, CTA flutuante. Backend `TravelPreferences` atualizado. Atualizados [[index]] e [[changelog]].

## [2026-07-13] ingest | RF02 Recuperação de Senha

Criada [[Recuperação de Senha]] — `sendPasswordResetEmail`, RHF + Zod, animação de sucesso, copy anti-enumeration. Atualizados [[Autenticação Full Stack]], [[index]] e [[changelog]].

## [2026-07-13] ingest | Home e Bottom Tabs (RF04)

Criada [[Home e Bottom Tabs]] — `FloatingTabBar` (BlurView iOS / bloco flutuante Android), Home com Magic Card, banner de Match, carrossel e grade Explore. Atualizados [[index]] e [[changelog]].

## [2026-07-13] update | Reinvenção Tabs + Home (botão mágico)

Atualizada [[Home e Bottom Tabs]]: 4 abas + FAB IA, Salvos/Viagens/Perfil, Home com vibe+❤️ e Em Alta. Removido Explorar.

## [2026-07-13] update | Wizard Solo + sheet fix + swipe invite

Atualizada [[Home e Bottom Tabs]]: wizard `/wizard/solo`, CreateTripSheet minimalista com dismiss, InviteBanner swipe-to-delete, Em Alta → `/trending`, lixeira nos Salvos.

## [2026-07-14] update | Sync wiki pré-commit Home/Tabs/Wizard

Atualizada [[Home e Bottom Tabs]] e [[index]] para o estado real do código. Changelog alinhado.
