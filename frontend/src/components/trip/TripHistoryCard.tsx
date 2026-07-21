// Card premium da aba Viagens — thumb Places + meta + press spring 0.97.

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";
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
import { getPlaceDetails } from "@/lib/api";
import { relativeTimeParts } from "@/lib/formatRelativeTime";
import type { SavedTrip } from "@/lib/trips";
import { Pressable } from "@/tw";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const SPRING = { damping: 20, stiffness: 300 };
const THUMB = 80;

type Props = {
  trip: SavedTrip;
  onPress: () => void;
};

export function TripHistoryCard({ trip, onPress }: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();

  const scale = useSharedValue(1);
  const shimmer = useSharedValue(0.45);
  const photoOpacity = useSharedValue(0);

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [loadingPhoto, setLoadingPhoto] = useState(true);
  const [imageReady, setImageReady] = useState(false);

  const days = trip.days?.length ?? 0;
  const relative = relativeTimeParts(trip.created_at ?? trip.updated_at);

  useEffect(() => {
    if (reduceMotion) {
      shimmer.value = 0.5;
      return;
    }
    shimmer.value = withRepeat(
      withTiming(0.7, {
        duration: 900,
        easing: Easing.inOut(Easing.quad),
      }),
      -1,
      true,
    );
  }, [reduceMotion, shimmer]);

  useEffect(() => {
    const query = trip.destination.trim();
    if (query.length < 2) {
      setLoadingPhoto(false);
      setPhotoUrl(null);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    photoOpacity.value = 0;
    setImageReady(false);
    setLoadingPhoto(true);

    (async () => {
      try {
        const result = await getPlaceDetails(
          query,
          undefined,
          undefined,
          controller.signal,
        );
        if (!cancelled) setPhotoUrl(result.photo_url);
      } catch (err) {
        if (cancelled || controller.signal.aborted) return;
        console.warn("[TripHistoryCard] Places lookup falhou:", err);
        if (!cancelled) setPhotoUrl(null);
      } finally {
        if (!cancelled) setLoadingPhoto(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [trip.destination, photoOpacity]);

  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: shimmer.value,
  }));

  const photoStyle = useAnimatedStyle(() => ({
    opacity: photoOpacity.value,
  }));

  function onPhotoLoad() {
    setImageReady(true);
    photoOpacity.value = reduceMotion
      ? 1
      : withTiming(1, {
          duration: 220,
          easing: Easing.out(Easing.cubic),
        });
  }

  const showShimmer = loadingPhoto || (Boolean(photoUrl) && !imageReady);
  const showFallback = !loadingPhoto && !photoUrl;

  const relativeLabel = relative
    ? relative.key === "trips.relative.today"
      ? t(relative.key)
      : t(relative.key, { count: relative.count })
    : null;

  const metaLine = [
    t("tripDetail.daysCount", { count: days }),
    relativeLabel,
  ]
    .filter(Boolean)
    .join(` ${t("trips.metaSeparator")} `);

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => {
        scale.value = withSpring(0.97, SPRING);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, SPRING);
      }}
      style={[
        pressStyle,
        styles.card,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
        },
      ]}
      accessibilityRole="button"
    >
      <View
        style={[
          styles.thumb,
          { backgroundColor: theme.border },
        ]}
      >
        {showShimmer ? (
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: theme.border },
              shimmerStyle,
            ]}
          />
        ) : null}

        {photoUrl ? (
          <Animated.View style={[StyleSheet.absoluteFill, photoStyle]}>
            <Image
              source={{ uri: photoUrl }}
              style={styles.thumbFill}
              contentFit="cover"
              transition={0}
              onLoad={onPhotoLoad}
              onError={() => {
                setImageReady(false);
                photoOpacity.value = 0;
                setPhotoUrl(null);
              }}
            />
          </Animated.View>
        ) : null}

        {showFallback ? (
          <View style={styles.fallback}>
            <Ionicons
              name="image-outline"
              size={28}
              color={theme.textMuted}
            />
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        <AppText className="text-[17px] font-bold" numberOfLines={1}>
          {trip.destination || t("tripDetail.fallbackTitle")}
        </AppText>
        <AppText tone="muted" className="text-[13px]" numberOfLines={1}>
          {metaLine}
        </AppText>
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 12,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: 16,
    overflow: "hidden",
  },
  thumbFill: {
    width: "100%",
    height: "100%",
  },
  fallback: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    flex: 1,
    gap: 4,
    paddingRight: 4,
  },
});
