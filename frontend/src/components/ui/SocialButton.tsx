// Botão social — Liquid Glass no iOS, superfície sólida no Android.
// O miolo (`Content`) é compartilhado; só o invólucro muda por plataforma.

import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import type { ReactNode } from "react";
import { Platform, type GestureResponderEvent } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { useTheme } from "@/hooks/use-theme";
import { Pressable, Text, View } from "@/tw";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const SPRING_CONFIG = { damping: 20, stiffness: 300 };
const isIOS = Platform.OS === "ios";

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

  const Content = (
    <>
      <Ionicons name="logo-google" size={22} color={theme.textPrimary} />
      <Text
        className="font-bold text-[17px] tracking-wide"
        style={{ color: theme.textPrimary }}
      >
        {children}
      </Text>
    </>
  );

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      style={animatedStyle}
      className={`rounded-2xl overflow-hidden ${disabled ? "opacity-50" : ""}`}
    >
      {isIOS ? (
        <BlurView
          intensity={40}
          tint="systemMaterial"
          className="flex-row items-center justify-center gap-3 py-4 px-6 border border-border-glass"
        >
          {Content}
        </BlurView>
      ) : (
        <View
          className="flex-row items-center justify-center gap-3 py-[15px] px-6 rounded-2xl border border-border"
          style={{ backgroundColor: theme.surface }}
        >
          {Content}
        </View>
      )}
    </AnimatedPressable>
  );
}
