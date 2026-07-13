// Input base — Monochrome Premium.
// O TextInput nativo no Android ignora `text-text-primary` do NativeWind;
// blindamos cor e placeholder via `useTheme()`. Borda animada só no foco —
// erro usa cor estática (evita worklet com valores JS voláteis).

import { Ionicons } from "@expo/vector-icons";
import { forwardRef, useEffect, useState, type ElementRef } from "react";
import type { TextInputProps } from "react-native";
import Animated, {
  FadeInLeft,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { useTheme } from "@/hooks/use-theme";
import { Pressable, Text, TextInput, View } from "@/tw";

const AnimatedView = Animated.createAnimatedComponent(View);
const AnimatedText = Animated.createAnimatedComponent(Text);

export type InputProps = TextInputProps & {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  error?: string;
  /** Chave i18n para o botão de toggle de senha (accessibilityLabel). */
  showPasswordLabel?: string;
  hidePasswordLabel?: string;
};

export const Input = forwardRef<ElementRef<typeof TextInput>, InputProps>(
  function Input(
    {
      label,
      icon,
      error,
      secureTextEntry,
      value,
      onFocus,
      onBlur,
      editable = true,
      showPasswordLabel = "Mostrar senha",
      hidePasswordLabel = "Ocultar senha",
      ...rest
    },
    ref,
  ) {
    const theme = useTheme();
    const [isFocused, setIsFocused] = useState(false);
    const [revealPassword, setRevealPassword] = useState(false);

    const focusProgress = useSharedValue(0);

    useEffect(() => {
      if (!error) {
        focusProgress.value = withTiming(isFocused ? 1 : 0, { duration: 200 });
      }
    }, [isFocused, error, focusProgress]);

    const animatedBorderStyle = useAnimatedStyle(() => {
      if (error) return { borderColor: theme.error };
      return {
        borderColor: isFocused ? theme.accent : theme.border,
      };
    });

    const handleFocus = (e: Parameters<NonNullable<TextInputProps["onFocus"]>>[0]) => {
      setIsFocused(true);
      onFocus?.(e);
    };

    const handleBlur = (e: Parameters<NonNullable<TextInputProps["onBlur"]>>[0]) => {
      setIsFocused(false);
      onBlur?.(e);
    };

    const labelColor = error
      ? theme.error
      : isFocused
        ? theme.accent
        : theme.textSecondary;

    return (
      <View className="gap-1.5">
        <Text
          className="text-[13px] font-semibold tracking-wide"
          style={{ color: labelColor }}
        >
          {label}
        </Text>

        <AnimatedView
          style={[
            { borderWidth: 1.5, backgroundColor: isFocused ? theme.background : theme.surface },
            animatedBorderStyle,
          ]}
          className={`flex-row items-center rounded-2xl px-4 h-[54px] ${!editable ? "opacity-50" : ""}`}
        >
          {icon && (
            <Ionicons
              name={icon}
              size={20}
              color={error ? theme.error : isFocused ? theme.accent : theme.textMuted}
              style={{ marginRight: 10 }}
            />
          )}

          <TextInput
            ref={ref}
            // Blindagem Android: cor nativa sempre espelha o color scheme ativo.
            style={{ color: theme.textPrimary, flex: 1, fontSize: 15, height: "100%" }}
            value={value}
            editable={editable}
            placeholderTextColor={theme.textMuted}
            secureTextEntry={secureTextEntry && !revealPassword}
            accessibilityLabel={label}
            onFocus={handleFocus}
            onBlur={handleBlur}
            {...rest}
          />

          {secureTextEntry && (
            <Pressable
              onPress={() => setRevealPassword((prev) => !prev)}
              className="pl-3 py-2 justify-center"
              accessibilityRole="button"
              accessibilityLabel={revealPassword ? hidePasswordLabel : showPasswordLabel}
            >
              <Ionicons
                name={revealPassword ? "eye-off-outline" : "eye-outline"}
                size={20}
                color={theme.textMuted}
              />
            </Pressable>
          )}
        </AnimatedView>

        {error && (
          <AnimatedText
            entering={FadeInLeft.duration(180)}
            className="text-xs font-medium pl-1"
            style={{ color: theme.error }}
          >
            {error}
          </AnimatedText>
        )}
      </View>
    );
  },
);
