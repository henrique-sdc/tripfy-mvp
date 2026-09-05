// Botão base — Monochrome Premium.
// Feedback no pointer-down (onPressIn) + spring (Emil/Apple). Cores críticas
// vão também via `style` nativo porque o TextInput/Text no Android nem sempre
// resolve tokens `light-dark()` do NativeWind v5.

import * as Haptics from "@/lib/haptics";
import type { ReactNode } from "react";
import { ActivityIndicator, type GestureResponderEvent } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { useTheme } from "@/hooks/use-theme";
import { Pressable, Text, View } from "@/tw";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type ButtonVariant = "primary" | "secondary" | "ghost";

type ButtonProps = {
  children: ReactNode;
  onPress?: (event: GestureResponderEvent) => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
};

const SPRING_CONFIG = { damping: 20, stiffness: 300 };

export function Button({
  children,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
  className = "",
}: ButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled || loading;
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  function handlePressIn() {
    if (isDisabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    scale.value = withSpring(0.96, SPRING_CONFIG);
  }

  function handlePressOut() {
    scale.value = withSpring(1, SPRING_CONFIG);
  }

  const labelColor =
    variant === "primary"
      ? theme.buttonText
      : variant === "ghost"
        ? theme.accent
        : theme.textPrimary;

  const label =
    typeof children === "string" ? (
      <Text
        className="font-bold text-[16px] tracking-wide"
        style={{ color: labelColor }}
      >
        {children}
      </Text>
    ) : (
      children
    );

  const Content = (
    <View className="flex-row items-center justify-center gap-2">
      {loading && (
        <ActivityIndicator color={labelColor} size="small" />
      )}
      {!loading && label}
    </View>
  );

  if (variant === "primary") {
    return (
      <AnimatedPressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={isDisabled}
        style={[animatedStyle, { backgroundColor: theme.buttonPrimary }]}
        className={`rounded-2xl py-[16px] items-center justify-center shadow-sm ${isDisabled ? "opacity-60" : ""} ${className}`}
      >
        {Content}
      </AnimatedPressable>
    );
  }

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={isDisabled}
      style={[
        animatedStyle,
        variant === "secondary" ? { backgroundColor: theme.surface } : undefined,
      ]}
      className={`rounded-2xl py-[16px] items-center justify-center ${
        variant === "secondary" ? "border border-border" : "bg-transparent"
      } ${isDisabled ? "opacity-50" : ""} ${className}`}
    >
      {Content}
    </AnimatedPressable>
  );
}
