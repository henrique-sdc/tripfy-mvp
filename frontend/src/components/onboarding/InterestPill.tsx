// Pílula de interesse — feedback tátil (haptics + spring bounce).
// Desselecionada: transparente + borda fina. Selecionada: accent + texto branco.

import * as Haptics from "@/lib/haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from "react-native-reanimated";

import { AppText } from "@/components/ui/AppText";
import { useTheme } from "@/hooks/use-theme";
import { Pressable } from "@/tw";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const SPRING = { damping: 14, stiffness: 320 };

type InterestPillProps = {
  emoji: string;
  label: string;
  selected: boolean;
  disabled?: boolean;
  onToggle: () => void;
};

export function InterestPill({
  emoji,
  label,
  selected,
  disabled,
  onToggle,
}: InterestPillProps) {
  const theme = useTheme();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  function handlePress() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    scale.value = withSequence(
      withSpring(0.95, SPRING),
      withSpring(1.05, SPRING),
      withSpring(1, SPRING),
    );
    onToggle();
  }

  return (
    <AnimatedPressable
      onPress={handlePress}
      disabled={disabled}
      style={[
        animatedStyle,
        {
          backgroundColor: selected ? theme.accent : "transparent",
          borderColor: selected ? theme.accent : theme.border,
        },
      ]}
      className="flex-row items-center gap-2 rounded-full px-4 py-2.5 border"
    >
      <AppText className="text-base">{emoji}</AppText>
      <AppText
        className="text-sm font-medium"
        style={{ color: selected ? "#ffffff" : theme.textSecondary }}
      >
        {label}
      </AppText>
    </AnimatedPressable>
  );
}
