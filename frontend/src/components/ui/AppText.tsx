// Texto com cor garantida no Dark Mode (Android).
// NativeWind v5 + light-dark() nem sempre propaga cor ao <Text> nativo;
// lemos o token via useTheme() e aplicamos style.color — mesma blindagem
// do Input.tsx e Button.tsx. Use para qualquer copy visível ao usuário.

import type { ComponentProps } from "react";

import { useTheme } from "@/hooks/use-theme";
import { Text } from "@/tw";

type Tone = "primary" | "secondary" | "muted" | "accent" | "error" | "success";

const SUCCESS = "#34c759";

type AppTextProps = ComponentProps<typeof Text> & {
  tone?: Tone;
};

export function AppText({
  tone = "primary",
  style,
  className,
  ...rest
}: AppTextProps) {
  const theme = useTheme();

  const color =
    tone === "success"
      ? SUCCESS
      : tone === "error"
        ? theme.error
        : tone === "accent"
          ? theme.accent
          : tone === "muted"
            ? theme.textMuted
            : tone === "secondary"
              ? theme.textSecondary
              : theme.textPrimary;

  return (
    <Text
      className={className}
      style={[{ color }, style]}
      {...rest}
    />
  );
}
