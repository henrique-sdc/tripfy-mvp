// AI Command Center — input estilo chat na Home. Abre o sheet do Wizard.

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import { useTranslation } from "react-i18next";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { AppText } from "@/components/ui/AppText";
import { useTheme } from "@/hooks/use-theme";
import { useCreateTripSheetStore } from "@/stores/createTripSheetStore";
import { Pressable, View } from "@/tw";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const SPRING = { damping: 20, stiffness: 300 };

export function AiCommandBar() {
  const { t } = useTranslation();
  const theme = useTheme();
  const open = useCreateTripSheetStore((s) => s.open);
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        open();
      }}
      onPressIn={() => {
        scale.value = withSpring(0.98, SPRING);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, SPRING);
      }}
      style={[
        style,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
        },
      ]}
      className="flex-row items-center gap-3 rounded-[22px] border px-4 py-3.5"
    >
      <View
        className="w-9 h-9 rounded-full items-center justify-center"
        style={{ backgroundColor: `${theme.accent}22` }}
      >
        <Ionicons name="sparkles" size={18} color={theme.accent} />
      </View>
      <AppText tone="secondary" className="flex-1 text-[15px]">
        {t("home.command.placeholder")}
      </AppText>
      <Ionicons name="arrow-forward-circle" size={28} color={theme.accent} />
    </AnimatedPressable>
  );
}
