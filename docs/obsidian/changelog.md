# Changelog — Tripfy Docs
Registro cronológico de todas as inserções e modificações

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
