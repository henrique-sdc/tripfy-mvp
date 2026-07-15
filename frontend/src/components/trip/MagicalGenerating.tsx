import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { AppText } from "@/components/ui/AppText";
import { useTheme } from "@/hooks/use-theme";

type MagicalGeneratingProps = {
  destination: string;
  translationPrefix?: "wizard.generating" | "match.generating";
};

/** Loading compartilhado das gerações Solo e Match. */
export function MagicalGenerating({
  destination,
  translationPrefix = "wizard.generating",
}: MagicalGeneratingProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(0.45);
  const spin = useSharedValue(0);
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (reduceMotion) {
      pulse.value = 1;
      spin.value = 0;
    } else {
      // Evento raro: respiração discreta e rotação linear mantêm feedback vivo.
      pulse.value = withRepeat(
        withTiming(1, {
          duration: 900,
          easing: Easing.bezier(0.77, 0, 0.175, 1),
        }),
        -1,
        true,
      );
      spin.value = withRepeat(
        withTiming(1, { duration: 1400, easing: Easing.linear }),
        -1,
        false,
      );
    }

    const id = setInterval(() => setPhase((value) => (value + 1) % 2), 2800);
    return () => clearInterval(id);
  }, [pulse, reduceMotion, spin]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
    transform: [{ scale: reduceMotion ? 1 : 0.96 + pulse.value * 0.04 }],
  }));

  const sparkleStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${reduceMotion ? 0 : spin.value * 360}deg` }],
  }));

  const statusText =
    phase === 0
      ? t(`${translationPrefix}.exploringMap`)
      : t(`${translationPrefix}.craftingTrip`, { destination });

  return (
    <Animated.View
      entering={FadeInDown.duration(220).easing(Easing.out(Easing.cubic))}
      exiting={FadeOut.duration(140)}
      style={styles.root}
    >
      <Animated.View
        style={[
          styles.orb,
          { backgroundColor: `${theme.accent}18` },
          sparkleStyle,
        ]}
      >
        <Ionicons name="sparkles" size={36} color={theme.accent} />
      </Animated.View>
      <Animated.View style={pulseStyle}>
        <AppText
          className="text-center text-[18px] font-semibold"
          style={{ letterSpacing: -0.2 }}
        >
          {statusText}
        </AppText>
      </Animated.View>
      <AppText tone="secondary" className="text-center text-[13px]">
        {t(`${translationPrefix}.hint`)}
      </AppText>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 20,
  },
  orb: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
});
