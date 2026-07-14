# Design System — Telas de Auth (Monochrome Premium)

Documentação da identidade visual e decisões técnicas das telas de autenticação e onboarding inicial do Tripfy.

Relacionado: [[Autenticação Full Stack]], [[NativeWind Setup]]

## Identidade visual

**Monochrome Premium** — paleta neutra de alto contraste, com acento violeta (`accent`) reservado para foco, links e detalhes (não para botões primários).

| Token CSS | Light | Dark | Uso |
|-----------|-------|------|-----|
| `background` | `#f7f8fa` | `#000000` | Fundo das telas |
| `surface` | `#ffffff` | `#1c1c1e` | Cards, inputs em repouso |
| `text-primary` | `#111111` | `#ffffff` | Títulos, corpo |
| `text-secondary` | `#8e8e93` | `#a1a1aa` | Subtítulos, hints |
| `text-muted` | `#c7c7cc` | `#636366` | Divisores ("ou") |
| `button-primary` | `#111111` | `#ffffff` | CTA principal (invertido) |
| `button-text` | `#ffffff` | `#111111` | Texto do CTA |
| `accent` | `#7c3aed` | `#9d4edd` | Links, foco, seleção |

Espelho JS: `frontend/src/constants/theme.ts` (via `useTheme()`).

## Componentes base (`src/components/ui/`)

| Componente | Responsabilidade |
|------------|------------------|
| `AppText` | Texto com `style.color` nativo — **obrigatório** para copy visível |
| `AuthLink` | Link de navegação com cor accent garantida |
| `Button` | CTA monochrome + spring no press + haptics |
| `Input` | Campo com blindagem de cor no `TextInput` |
| `PasswordStrengthBar` | 4 segmentos animados (Reanimated) |
| `SocialButton` | iOS: BlurView / Android: `surface` sólido |
| `OfflineBanner` | Aviso de backend inalcançável (Missão rede) |

## Dark Mode no Android — blindagem obrigatória

**Problema:** NativeWind v5 + Tailwind v4 com `light-dark()` em `global.css` **não propaga** `text-text-primary` / `text-text-secondary` ao componente `<Text>` nativo no Android. Resultado: texto preto (#000 default) sobre fundo preto.

**Regra do projeto (desde 2026-07-13):**

1. **Nunca** confiar só em `className="text-text-*"` para copy legível.
2. Usar **`AppText`** (ou `style={{ color: theme.textPrimary }}`) em toda string visível.
3. Fundo de tela: `style={{ backgroundColor: theme.background }}` no `ScrollView` / `KeyboardAvoidingView` — não só `bg-background`.
4. `TextInput`: sempre `style={{ color: theme.textPrimary }}` (já no `Input.tsx`).
5. Links: usar **`AuthLink`**, não `Link` com `className="text-accent"`.

Layout/spacing continuam via NativeWind `className`.

## Platform-aware (Liquid Glass)

| Superfície | iOS | Android |
|------------|-----|---------|
| Painel onboarding slides | `BlurView` | `LinearGradient` cinematográfico |
| SocialButton | `BlurView` | `bg-surface` sólido |
| CTA flutuante (preferências) | fade `transparent → background` no topo | barra sólida + `borderTop` hairline |

O **conteúdo interno** (textos, botões) é compartilhado; só o invólucro muda.


## Navegação principal (RF04)

Ver [[Home e Bottom Tabs]] — `FloatingTabBar` reutiliza o mesmo contrato platform-aware (BlurView iOS / surface Android) e a Home consome `AppText` + tokens de `theme.ts`.

## Formulários (RHF + Zod)

Telas com input de texto usam **`react-hook-form`** + **`zodResolver`** — evita `useState` por campo e re-renders desnecessários.

| Tela | Schema | Notas |
|------|--------|-------|
| `login.tsx` | email + password | `mode: "onBlur"` |
| `register.tsx` | nome, email, nascimento, senha | máscara `DD/MM/AAAA` em tempo real; `mode: "onChange"` |
| `forgot-password.tsx` | email | sucesso com `FadeIn`/`FadeOut`; botão `disabled` pós-envio |

Erros de validação e Firebase sempre via chaves i18n (`auth.errors.*`); Firebase mapeado em `lib/auth-errors.ts`.

## Copywriting (Stop Slop)

- Frases curtas, diretas, sem jargão de produto.
- Recuperação de senha: copy genérica de sucesso (anti-enumeration Firebase) — [[Recuperação de Senha]].
- Preferências: tom de **perfil habitual** ("Como você costuma…"), não de viagem em planejamento — [[Preferências Sua Vibe]].

## Telas cobertas

- `(onboarding-slides)/index.tsx` — carrossel 1× por instalação (`onboardingStore`)
- `(auth)/login.tsx`, `register.tsx`, `forgot-password.tsx`
- `(onboarding)/preferences.tsx` — tela **[[Preferências Sua Vibe]]** (onboarding tátil v2)

## i18n

Todas as strings visíveis em `frontend/src/locales/pt-BR.json`. Placeholders, acessibilidade e copy de auth centralizados sob chaves `auth.*` e `onboardingSlides.*`.

## Animações (Emil / Apple)

- Press feedback no `onPressIn` (não no release)
- `withSpring` nos botões (scale ~0.96–0.97)
- Haptics leve nos CTAs
- PasswordStrengthBar: `withTiming` 220ms por segmento + `FadeIn`/`FadeOut` no container
- CapsuleSelector: indicador com `withTiming`; largura por segmento = `trackWidth / N` (não `onLayout` por item)

### Reanimated — tipagem de layout animado

Valores de **largura/posição** animados (`width`, `translateX`) ficam em `useSharedValue<number>` e são aplicados via `useAnimatedStyle`. Evitar misturar strings percentuais (`"50%"`) com números animados — medir o container com `onLayout` e animar pixels. Padrão usado em `CapsuleSelector` e `PasswordStrengthBar`.

## Decisões adiadas

- **Google Sign-In:** requer dev client (EAS Build) — botão desabilitado com "(em breve)"
- **Data de nascimento:** validada no cadastro, não persistida no backend (RF01)
