// Sugestões perto da parada — sheet curto, sem foto (a capa vem depois, no card).
// Física igual ao PlaceDetailsSheet: sobe em 240 ms, fecha mais rápido.

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText } from "@/components/ui/AppText";
import { useTheme } from "@/hooks/use-theme";
import { getNearbyPlaces, type NearbyPlace } from "@/lib/api";
import {
  haversineMeters,
  routeDistanceParts,
  type LatLng,
  type TravelMode,
} from "@/lib/routeLegs";

const ENTER = { duration: 240, easing: Easing.out(Easing.cubic) };
const DISMISS_MS = 180;
const DISMISS_Y = 100;

export type NearbySuggestion = NearbyPlace & { meters: number };

type ExistingStop = {
  place_id?: string | null;
  title: string;
};

type Props = {
  visible: boolean;
  anchor: LatLng | null;
  travelMode: TravelMode;
  interests: string[];
  existing: ExistingStop[];
  onClose: () => void;
  onAdd: (place: NearbySuggestion) => void;
};

export function NearbySuggestionsSheet({
  visible,
  anchor,
  travelMode,
  interests,
  existing,
  onClose,
  onAdd,
}: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const open = visible && anchor != null;

  const translateY = useSharedValue(400);
  const backdrop = useSharedValue(0);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [radius, setRadius] = useState<number | null>(null);
  const [places, setPlaces] = useState<NearbySuggestion[]>([]);

  useEffect(() => {
    if (!open) return;
    if (reduceMotion) {
      translateY.value = 0;
      backdrop.value = 1;
    } else {
      translateY.value = 400;
      backdrop.value = 0;
      translateY.value = withTiming(0, ENTER);
      backdrop.value = withTiming(1, {
        duration: 200,
        easing: Easing.out(Easing.quad),
      });
    }
  }, [open, reduceMotion, translateY, backdrop]);

  useEffect(() => {
    if (!open || !anchor) return;
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    setError(false);
    setPlaces([]);

    const takenIds = new Set(
      existing.flatMap((stop) =>
        stop.place_id ? [stop.place_id] : [],
      ),
    );
    const takenTitles = new Set(
      existing
        .map((stop) => stop.title.trim().toLowerCase())
        .filter((title) => title.length > 0),
    );

    void (async () => {
      try {
        const result = await getNearbyPlaces(
          anchor.latitude,
          anchor.longitude,
          travelMode,
          interests,
          controller.signal,
        );
        if (cancelled) return;
        setRadius(result.radius_meters);
        const ranked = result.places
          .filter(
            (place) =>
              !takenIds.has(place.place_id) &&
              !takenTitles.has(place.name.trim().toLowerCase()),
          )
          .map((place) => ({
            ...place,
            meters: haversineMeters(anchor, place),
          }))
          .sort((a, b) => a.meters - b.meters);
        setPlaces(ranked);
      } catch (err) {
        if (cancelled || controller.signal.aborted) return;
        console.warn("[nearby] falha ao buscar:", err);
        setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [open, anchor, travelMode, interests, existing]);

  function finishClose() {
    onClose();
  }

  function dismiss() {
    if (reduceMotion) {
      onClose();
      return;
    }
    translateY.value = withTiming(500, { duration: DISMISS_MS }, (finished) => {
      if (finished) runOnJS(finishClose)();
    });
    backdrop.value = withTiming(0, { duration: 160 });
  }

  const pan = Gesture.Pan()
    .activeOffsetY(12)
    .failOffsetX([-20, 20])
    .onUpdate((event) => {
      if (event.translationY > 0) {
        translateY.value = event.translationY;
      }
    })
    .onEnd((event) => {
      if (event.translationY > DISMISS_Y || event.velocityY > 800) {
        runOnJS(dismiss)();
      } else {
        translateY.value = withTiming(0, ENTER);
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdrop.value * 0.5,
  }));

  const radiusLabel =
    radius == null
      ? ""
      : radius < 1000
        ? t("tripDetail.suggestions.radiusM", { count: radius })
        : t("tripDetail.suggestions.radiusKm", {
            distance: (radius / 1000).toLocaleString("pt-BR", {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
            }),
          });

  return (
    <Modal
      visible={open}
      transparent
      animationType="none"
      onRequestClose={dismiss}
      statusBarTranslucent
    >
      <GestureHandlerRootView style={styles.fill}>
        <View style={[styles.fill, styles.end]}>
          <Animated.View style={[styles.backdrop, backdropStyle]}>
            <Pressable style={styles.fill} onPress={dismiss} />
          </Animated.View>
          <GestureDetector gesture={pan}>
            <Animated.View
              style={[
                styles.sheet,
                sheetStyle,
                {
                  backgroundColor: theme.background,
                  paddingBottom: Math.max(insets.bottom, 16),
                },
              ]}
            >
              <View style={styles.handleHit}>
                <View
                  style={[styles.handle, { backgroundColor: theme.border }]}
                />
              </View>
              <View style={styles.header}>
                <AppText className="text-[17px] font-semibold">
                  {t("tripDetail.suggestions.title")}
                </AppText>
                {radiusLabel ? (
                  <AppText tone="secondary" className="text-[13px]">
                    {radiusLabel}
                  </AppText>
                ) : null}
              </View>

              {loading ? (
                <ActivityIndicator
                  color={theme.accent}
                  style={styles.status}
                />
              ) : error ? (
                <AppText
                  tone="secondary"
                  className="text-[14px]"
                  style={styles.status}
                >
                  {t("tripDetail.suggestions.error")}
                </AppText>
              ) : places.length === 0 ? (
                <AppText
                  tone="secondary"
                  className="text-[14px]"
                  style={styles.status}
                >
                  {t("tripDetail.suggestions.empty")}
                </AppText>
              ) : (
                <ScrollView
                  style={styles.list}
                  contentContainerStyle={styles.listContent}
                  keyboardShouldPersistTaps="handled"
                >
                  {places.map((place) => {
                    const distance = routeDistanceParts(place.meters);
                    return (
                      <View key={place.place_id} style={styles.row}>
                        <View style={styles.rowText}>
                          <AppText
                            className="text-[15px] font-semibold"
                            numberOfLines={2}
                          >
                            {place.name}
                          </AppText>
                          <AppText tone="secondary" className="text-[12px]">
                            {[
                              place.type_label,
                              t(distance.key, distance.values),
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </AppText>
                        </View>
                        <Pressable
                          onPress={() => {
                            Haptics.impactAsync(
                              Haptics.ImpactFeedbackStyle.Light,
                            );
                            onAdd(place);
                            dismiss();
                          }}
                          style={[
                            styles.add,
                            { backgroundColor: theme.buttonPrimary },
                          ]}
                          accessibilityLabel={t("tripDetail.suggestions.add")}
                        >
                          <AppText
                            className="text-[13px] font-semibold"
                            style={{ color: theme.buttonText }}
                          >
                            {t("tripDetail.suggestions.add")}
                          </AppText>
                        </Pressable>
                      </View>
                    );
                  })}
                </ScrollView>
              )}
              <Pressable
                onPress={dismiss}
                style={styles.close}
                accessibilityLabel={t("tripDetail.close")}
              >
                <Ionicons name="close" size={18} color={theme.textSecondary} />
              </Pressable>
            </Animated.View>
          </GestureDetector>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  end: { justifyContent: "flex-end" },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#000",
  },
  sheet: {
    maxHeight: "70%",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 6,
  },
  handleHit: { alignItems: "center", paddingVertical: 8 },
  handle: { width: 36, height: 5, borderRadius: 3 },
  header: { paddingHorizontal: 20, paddingRight: 44, paddingBottom: 8, gap: 2 },
  status: { paddingHorizontal: 20, paddingVertical: 28 },
  list: { flexGrow: 0 },
  listContent: { paddingHorizontal: 20, paddingBottom: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
  },
  rowText: { flex: 1, gap: 2 },
  add: {
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  close: {
    position: "absolute",
    top: 12,
    right: 12,
    padding: 6,
  },
});
