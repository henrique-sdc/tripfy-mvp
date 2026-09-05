// Card do último roteiro planejado — foto Places + destino + dias.

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { AppText } from "@/components/ui/AppText";
import { useTheme } from "@/hooks/use-theme";
import { Pressable, View } from "@/tw";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const SPRING = { damping: 20, stiffness: 300 };
export const LATEST_TRIP_CARD_HEIGHT = 88;

type UpcomingTicketProps = {
  destination: string;
  days: number;
  image: string | null;
  loading?: boolean;
  onPress?: () => void;
};

export function UpcomingTicket({
  destination,
  days,
  image,
  loading = false,
  onPress,
}: UpcomingTicketProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const shimmer = useSharedValue(0.45);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: shimmer.value,
  }));

  useEffect(() => {
    if (!loading || reduceMotion) {
      shimmer.value = 0.45;
      return;
    }
    shimmer.value = withRepeat(
      withTiming(0.9, {
        duration: 900,
        easing: Easing.inOut(Easing.quad),
      }),
      -1,
      true,
    );
  }, [loading, reduceMotion, shimmer]);

  if (loading) {
    return (
      <View
        style={[
          styles.card,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
        accessibilityLabel={t("home.ticket.loadingA11y")}
      >
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: theme.border },
            shimmerStyle,
          ]}
        />
      </View>
    );
  }

  return (
    <AnimatedPressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
      }}
      onPressIn={() => {
        scale.value = withSpring(0.97, SPRING);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, SPRING);
      }}
      style={style}
      className="rounded-2xl overflow-hidden"
      accessibilityRole="button"
    >
      <View style={styles.card}>
        {image ? (
          <Image
            source={{ uri: image }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
        ) : (
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: theme.surface },
            ]}
          />
        )}
        <LinearGradient
          colors={["rgba(0,0,0,0.15)", "rgba(0,0,0,0.75)"]}
          style={StyleSheet.absoluteFill}
        />
        <View className="flex-1 flex-row items-center justify-between px-4">
          <View className="flex-1 pr-3 gap-1">
            <AppText
              className="text-[11px] font-semibold uppercase tracking-widest"
              style={{ color: "rgba(255,255,255,0.75)" }}
            >
              {t("home.ticket.badge")}
            </AppText>
            <AppText className="text-[16px] font-bold" style={{ color: "#fff" }}>
              {destination}
            </AppText>
            <AppText
              className="text-[12px] font-medium"
              style={{ color: "rgba(255,255,255,0.8)" }}
            >
              {t("home.ticket.days", { count: days })}
            </AppText>
          </View>
          <View className="flex-row items-center gap-1">
            <AppText
              className="text-[13px] font-semibold"
              style={{ color: "#fff" }}
            >
              {t("home.ticket.cta")}
            </AppText>
            <Ionicons name="chevron-forward" size={16} color="#fff" />
          </View>
        </View>
      </View>
    </AnimatedPressable>
  );
}

/** Empty state fixo — mesma altura do ticket pra não pular o layout. */
export function LatestTripEmpty({ onPress }: { onPress?: () => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
      }}
      onPressIn={() => {
        scale.value = withSpring(0.97, SPRING);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, SPRING);
      }}
      style={[
        style,
        styles.card,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
          borderWidth: 1,
          paddingHorizontal: 16,
          justifyContent: "center",
        },
      ]}
      accessibilityRole="button"
    >
      <AppText className="text-[14px] font-semibold" tone="secondary">
        {t("home.ticket.emptyTitle")}
      </AppText>
      <AppText className="text-[13px] mt-1" tone="muted">
        {t("home.ticket.emptyBody")}
      </AppText>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    height: LATEST_TRIP_CARD_HEIGHT,
    borderRadius: 16,
    overflow: "hidden",
  },
});
