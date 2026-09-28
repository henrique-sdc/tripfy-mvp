// Conector entre paradas: pontos + cápsula com tempo e distância reais.
// Sem SVG — traço pontilhado que o Android desenha igual ao iOS.

import { Ionicons } from "@expo/vector-icons";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { AppText } from "@/components/ui/AppText";
import { useTheme } from "@/hooks/use-theme";
import {
  routeDistanceParts,
  routeDurationParts,
  type RouteLeg,
  type TravelMode,
} from "@/lib/routeLegs";

const MODE_ICON = {
  walking: "walk",
  public_transit: "bus",
  ride_hail: "car-outline",
} as const;

type Props = {
  mode: TravelMode;
  leg: RouteLeg | null;
  loading: boolean;
};

export function RouteConnector({ mode, leg, loading }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(reduceMotion || loading ? 1 : 0);

  useEffect(() => {
    if (loading || reduceMotion) {
      opacity.value = 1;
      return;
    }
    opacity.value = 0;
    opacity.value = withTiming(1, {
      duration: 220,
      easing: Easing.out(Easing.cubic),
    });
  }, [loading, leg, reduceMotion, opacity]);

  const fade = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (!loading && !leg) return null;

  const durationParts = leg ? routeDurationParts(leg.duration_seconds) : null;
  const distanceParts = leg ? routeDistanceParts(leg.distance_meters) : null;
  const duration = durationParts ? t(durationParts.key, durationParts.values) : "";
  const distance = distanceParts ? t(distanceParts.key, distanceParts.values) : "";
  const label = leg
    ? t("tripDetail.route.label", { duration, distance })
    : t("tripDetail.route.loading");

  return (
    <Animated.View style={[styles.row, fade]} accessibilityLabel={label}>
      <View style={styles.dots} accessibilityElementsHidden>
        {[0, 1, 2, 3].map((dot) => (
          <View
            key={dot}
            style={[styles.dot, { backgroundColor: theme.textMuted }]}
          />
        ))}
      </View>
      <View
        style={[
          styles.capsule,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        {loading || !leg ? (
          <View
            style={[styles.skeleton, { backgroundColor: theme.border }]}
          />
        ) : (
          <>
            <Ionicons
              name={MODE_ICON[mode]}
              size={14}
              color={theme.textSecondary}
            />
            <AppText tone="secondary" className="text-[12px]">
              {label}
            </AppText>
          </>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 36,
    paddingLeft: 18,
  },
  dots: {
    width: 12,
    height: 28,
    alignItems: "center",
    justifyContent: "space-between",
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
  },
  capsule: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
  },
  skeleton: {
    width: 72,
    height: 8,
    borderRadius: 4,
  },
});
