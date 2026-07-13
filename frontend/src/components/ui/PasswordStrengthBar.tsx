// Indicador de força de senha — 4 segmentos estilo iOS/1Password.
// Cada barrinha anima cor e opacidade com withTiming ao digitar (Emil:
// feedback contínuo durante a interação, <300ms).

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { AppText } from "@/components/ui/AppText";
import { useTheme } from "@/hooks/use-theme";
import { View } from "@/tw";

type PasswordStrengthBarProps = {
  password?: string;
};

const STRENGTH_KEYS = ["", "weak", "fair", "good", "strong"] as const;

// Cores semânticas de força — independentes do tema (sempre legíveis).
const STRENGTH_COLORS = ["#ff3b30", "#ff9500", "#ffcc00", "#34c759"];

function calculateScore(password: string): 0 | 1 | 2 | 3 | 4 {
  if (!password) return 0;
  let score = 0;
  if (password.length >= 8) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  return Math.max(1, score) as 1 | 2 | 3 | 4;
}

function StrengthSegment({
  index,
  score,
  emptyColor,
}: {
  index: number;
  score: number;
  emptyColor: string;
}) {
  const filled = index <= score;
  const targetColor = STRENGTH_COLORS[Math.min(score, 4) - 1] ?? emptyColor;

  const progress = useSharedValue(filled ? 1 : 0);
  const segmentColor = useSharedValue(emptyColor);

  useEffect(() => {
    progress.value = withTiming(filled ? 1 : 0, { duration: 220 });
    segmentColor.value = withTiming(filled ? targetColor : emptyColor, {
      duration: 220,
    });
  }, [filled, targetColor, emptyColor, progress, segmentColor]);

  const style = useAnimatedStyle(() => ({
    backgroundColor: segmentColor.value,
    opacity: 0.35 + progress.value * 0.65,
    transform: [{ scaleX: 0.92 + progress.value * 0.08 }],
  }));

  return (
    <Animated.View
      style={[style, { flex: 1, height: 6, borderRadius: 999 }]}
    />
  );
}

export function PasswordStrengthBar({ password = "" }: PasswordStrengthBarProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const score = calculateScore(password);

  if (password.length === 0) return null;

  const labelKey = STRENGTH_KEYS[score];
  const labelColor = STRENGTH_COLORS[Math.min(score, 4) - 1];

  return (
    <Animated.View
      entering={FadeIn.duration(180)}
      exiting={FadeOut.duration(140)}
      className="gap-1.5 px-1 mt-1"
    >
      <View className="flex-row gap-1.5">
        {[1, 2, 3, 4].map((index) => (
          <StrengthSegment
            key={index}
            index={index}
            score={score}
            emptyColor={theme.border}
          />
        ))}
      </View>
      <AppText
        className="text-xs font-bold text-right tracking-wide"
        style={{ color: labelColor }}
      >
        {t(`auth.passwordStrength.${labelKey}`)}
      </AppText>
    </Animated.View>
  );
}
