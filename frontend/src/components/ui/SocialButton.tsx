// Botão social — vidro nativo no iOS, superfície sólida no Android.
//
// O layout vai por `style`, não por className: o GlassSurface renderiza um
// GlassView/BlurView nativo, e esses não são instrumentados pelo react-native-css.
// Era esse o bug do ícone "desalinhado" — sem `flexDirection: row` o React Native
// cai no default `column` e o logo empilhava em cima do texto.

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import type { ReactNode } from "react";
import type { GestureResponderEvent } from "react-native";
import {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { GlassSurface } from "@/components/ui/GlassSurface";
import { useTheme } from "@/hooks/use-theme";
import { AnimatedPressable, Text, View } from "@/tw";

const SPRING_CONFIG = { damping: 20, stiffness: 300 };
const ICON_SIZE = 22;

type SocialButtonProps = {
  provider: "google";
  children: ReactNode;
  onPress?: (event: GestureResponderEvent) => void;
  disabled?: boolean;
};

export function SocialButton({
  children,
  onPress,
  disabled = false,
}: SocialButtonProps) {
  const theme = useTheme();
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  function handlePressIn() {
    if (disabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    scale.value = withSpring(0.97, SPRING_CONFIG);
    opacity.value = withTiming(0.85, { duration: 100 });
  }

  function handlePressOut() {
    scale.value = withSpring(1, SPRING_CONFIG);
    opacity.value = withTiming(1, { duration: 150 });
  }

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      style={animatedStyle}
      className={`rounded-2xl overflow-hidden ${disabled ? "opacity-50" : ""}`}
    >
      <GlassSurface
        interactive={!disabled}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          paddingVertical: 16,
          paddingHorizontal: 24,
          borderWidth: 1,
          borderColor: theme.borderGlass,
        }}
      >
        {/* Caixa de tamanho fixo: o glifo do Ionicons é um <Text> e herdaria
            o leading da fonte, empurrando o ícone alguns pixels pra cima. */}
        <View
          style={{
            width: ICON_SIZE,
            height: ICON_SIZE,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons
            name="logo-google"
            size={ICON_SIZE}
            color={theme.textPrimary}
          />
        </View>
        <Text
          className="font-bold text-[17px] tracking-wide"
          style={{ color: theme.textPrimary }}
        >
          {children}
        </Text>
      </GlassSurface>
    </AnimatedPressable>
  );
}
