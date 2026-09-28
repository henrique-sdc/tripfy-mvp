# Índice do Tripfy Wiki
Bem-vindo à base de conhecimento do Tripfy. Mantida por IA.

## Páginas

- [[SETUP]] — máquina formatada: Windows, Cursor, MCP Obsidian, `.env`, FastAPI, Expo, emulador, `firestore.rules`. Canônico: `docs/SETUP.md`.
- [[Autenticação Full Stack]] — cadastro, login, sessão persistente e onboarding de preferências (RF01 + Seção 3.3).
- [[Design System Auth]] — Monochrome Premium, componentes UI, blindagem Dark Mode Android, Liquid Glass.
- [[Preferências Sua Vibe]] — onboarding tátil pós-cadastro, modelo expandido (pace, transport, dietary).
- [[Recuperação de Senha]] — RF02: reset via Firebase (`sendPasswordResetEmail`), RHF + Zod, animação de sucesso.
- [[Home e Bottom Tabs]] — RF04/RF05/RF08: FloatingTabBar + FAB IA, Home (vibe, Explorar, Em Alta), Wizard Solo, Salvos/Viagens/Perfil.
- [[NativeWind Setup]] — configuração de estilização (NativeWind v5 + Tailwind v4).
- [[Liquid Glass e Vidro Nativo]] — escada iOS 26 / iOS 16.4 / Android, guardas de runtime, a armadilha do `className` morto e o swipe-to-delete.
- [[Geração de Roteiro RF06]] — RF06: LLM trocável (`openai`/`gemini`), SSE, prompt anti-injection, prefs do Firestore.
- [[Deslocamento e Alternativas]] — tempo e distância reais (Routes API) e sugestões Nearby pela vibe. Fora do pin offline.
- [[Afiliados RF10]] — RF10: Smart Deep Links para Booking / Skyscanner / GetYourGuide (sem Amadeus).
- [[Detalhe da Viagem RF07]] — RF07: Lista/Mapa, drag-and-drop, coração → Firestore, coords opcionais.
- [[Modo Viagem]] — assistente de campo: Planejar/Viajar, checkbox, mapa nativo, trava de review.
- [[Modo Offline]] — Premium: pin do roteiro no aparelho, fotos de capa, mapa e edição fora quando não há rede.
- [[Gerenciamento de Perfil RF03]] — RF03/LGPD: perfil com stats, editar foto/nome/bio/vibe, área de Configurações (suporte, sair, excluir conta).
- [[Tripfy Pro e Paywall]] — mock de assinatura TCC: teto de 2 viagens ativas, 402, checkout simulado, overlay do paywall.
- [[Rede de Companheiros]] — proxy FastAPI de perfil público + lista unilateral `companions` (Passo 1 backend).
- [[Match de Viajantes RF11 RF12]] — lobby realtime para dois viajantes, deep link, geração single-flight e roteiro compartilhado.
- [[Edição Conjunta]] — um roteiro para dois (Match ou convite numa viagem Solo), ops com revisão, `onSnapshot` e presença no Realtime Database.
- [[Build iOS EAS iPhone]] — development build no iPhone 13 via EAS (Windows, sem Xcode); Kaspersky + hotspot; certificados na Expo.
- [[Notificações Contextuais]] — lembrete, avaliação e chuva via Expo Push; tick HTTP no FastAPI, sem GPS em background.
- [[Testar Notificações]] — development build, suporte via curl e janela do tick. Sem segredo no arquivo.
