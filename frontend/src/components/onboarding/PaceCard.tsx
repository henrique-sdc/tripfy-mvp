// Card de ritmo (pace) — seleção única. O card ativo fica nítido; os outros
// afundam (opacity 0.4 + scale 0.96) para guiar o olho sem bloquear toque.

import * as Haptics from "@/lib/haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { AppText } from "@/components/ui/AppText";
import { useTheme } from "@/hooks/use-theme";
import { Pressable, View } from "@/tw";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type PaceCardProps = {
  emoji: string;
  title: string;
  description: string;
  selected: boolean;
  anySelected: boolean;
  disabled?: boolean;
  onSelect: () => void;
};

export function PaceCard({
  emoji,
  title,
  description,
  selected,
  anySelected,
  disabled,
  onSelect,
}: PaceCardProps) {
  const theme = useTheme();
  const scale = useSharedValue(1);

  const dimmed = anySelected && !selected;

  const cardStyle = useAnimatedStyle(() => ({
    opacity: dimmed ? 0.4 : 1,
    transform: [{ scale: dimmed ? 0.96 : scale.value }],
  }));

  function handlePressIn() {
    scale.value = withSpring(0.97, { damping: 20, stiffness: 300 });
  }

  function handlePressOut() {
    scale.value = withSpring(1, { damping: 20, stiffness: 300 });
  }

  function handlePress() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onSelect();
  }

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      style={[
        cardStyle,
        {
          backgroundColor: selected ? theme.accent : theme.surface,
          borderColor: selected ? theme.accent : theme.border,
        },
      ]}
      className="flex-1 rounded-2xl border p-4 min-h-[120px] justify-between"
    >
      <AppText className="text-2xl">{emoji}</AppText>
      <View className="gap-1 mt-2">
        <AppText
          className="text-base font-bold"
          style={{ color: selected ? "#ffffff" : theme.textPrimary }}
        >
          {title}
        </AppText>
        <AppText
          className="text-xs leading-4"
          style={{ color: selected ? "rgba(255,255,255,0.85)" : theme.textSecondary }}
        >
          {description}
        </AppText>
      </View>
    </AnimatedPressable>
  );
}
