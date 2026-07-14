# Log — Tripfy Wiki
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
