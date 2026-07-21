// Lixeira — soft-deleted ≤30 dias; restaurar via API; swipe = apagar de vez.

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Href, router, useFocusEffect } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  Pressable as RNPressable,
  StyleSheet,
  useColorScheme,
} from "react-native";
import Swipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText } from "@/components/ui/AppText";
import { useTheme } from "@/hooks/use-theme";
import {
  listTrashTrips,
  restoreTripApi,
  type SavedTripApi,
} from "@/lib/api";
import { purgeTrip } from "@/lib/trips";
import { Pressable, ScrollView, View } from "@/tw";

const DELETE_ACTION_W = 76;
const OVERSWIPE_DELETE_AT = 1.45;

/** Ação vermelha estilo Mail — overswipe ou tap apaga de vez. */
function SwipePurgeAction({
  progress,
  onPurge,
  accessibilityLabel,
}: {
  progress: SharedValue<number>;
  onPurge: () => void;
  accessibilityLabel: string;
}) {
  const fired = useSharedValue(false);

  useAnimatedReaction(
    () => progress.value,
    (current) => {
      if (current >= OVERSWIPE_DELETE_AT && !fired.value) {
        fired.value = true;
        runOnJS(onPurge)();
      }
      if (current < 0.2) {
        fired.value = false;
      }
    },
  );

  const iconStyle = useAnimatedStyle(() => {
    const scale = interpolate(
      progress.value,
      [0, 1, OVERSWIPE_DELETE_AT],
      [0.9, 1, 1.2],
      Extrapolation.CLAMP,
    );
    return { opacity: 1, transform: [{ scale }] };
  });

  return (
    <RNPressable
      onPress={onPurge}
      style={styles.deleteAction}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Animated.View style={[styles.deleteIconWrap, iconStyle]}>
        <Ionicons name="trash" size={22} color="#FFFFFF" />
      </Animated.View>
    </RNPressable>
  );
}

export default function TrashScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const scheme = useColorScheme();
  const insets = useSafeAreaInsets();

  const [items, setItems] = useState<SavedTripApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listTrashTrips();
      setItems(data);
    } catch (err) {
      console.error("[trash] Falha ao listar:", err);
      Alert.alert(t("trash.loadErrorTitle"), t("trash.loadErrorBody"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function onRestore(trip: SavedTripApi) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRestoringId(trip.id);
    try {
      await restoreTripApi(trip.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setItems((prev) => prev.filter((x) => x.id !== trip.id));
    } catch (err) {
      console.error("[trash] Restore falhou:", err);
      Alert.alert(t("trash.restoreErrorTitle"), t("trash.restoreErrorBody"));
    } finally {
      setRestoringId(null);
    }
  }

  function onPurge(trip: SavedTripApi) {
    // Otimista — purge é irreversível; contexto da lixeira já é destrutivo.
    setItems((prev) => prev.filter((x) => x.id !== trip.id));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    void (async () => {
      try {
        await purgeTrip(trip.id);
      } catch (err) {
        console.error("[trash] Purge falhou:", err);
        Alert.alert(t("trash.purgeErrorTitle"), t("trash.purgeErrorBody"));
        void load();
      }
    })();
  }

  return (
    <View className="flex-1" style={{ backgroundColor: theme.background }}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <View
        className="flex-row items-center px-6"
        style={{ paddingTop: insets.top + 8, paddingBottom: 8 }}
      >
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          hitSlop={12}
          className="w-10 h-10 rounded-full items-center justify-center mr-2"
          style={{ backgroundColor: theme.surface }}
          accessibilityLabel={t("editProfile.back")}
        >
          <Ionicons name="chevron-back" size={22} color={theme.textPrimary} />
        </Pressable>
        <AppText className="text-[20px] font-bold flex-1">
          {t("trash.title")}
        </AppText>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingBottom: insets.bottom + 32,
          gap: 12,
        }}
      >
        <AppText tone="secondary" className="text-[13px] leading-5 mb-2">
          {t("trash.subtitle")}
        </AppText>

        {loading ? (
          <ActivityIndicator color={theme.accent} style={{ marginTop: 24 }} />
        ) : items.length === 0 ? (
          <View className="items-center gap-2 mt-10 px-4">
            <Ionicons
              name="trash-outline"
              size={36}
              color={theme.textMuted}
            />
            <AppText className="text-[16px] font-semibold text-center">
              {t("trash.emptyTitle")}
            </AppText>
            <AppText tone="secondary" className="text-[13px] text-center">
              {t("trash.emptyBody")}
            </AppText>
          </View>
        ) : (
          items.map((trip) => (
            <View key={trip.id} style={styles.swipeClip}>
              <Swipeable
                friction={2}
                rightThreshold={40}
                overshootRight
                overshootFriction={8}
                dragOffsetFromRightEdge={28}
                renderRightActions={(progress, _translation, methods) => (
                  <SwipePurgeAction
                    progress={progress}
                    accessibilityLabel={t("trash.swipePurgeA11y")}
                    onPurge={() => {
                      methods.close();
                      onPurge(trip);
                    }}
                  />
                )}
              >
                <View
                  className="rounded-3xl border p-4 gap-3"
                  style={{
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                  }}
                >
                  <View className="gap-1">
                    <AppText className="text-[16px] font-bold" numberOfLines={1}>
                      {trip.destination || t("tripDetail.fallbackTitle")}
                    </AppText>
                    <AppText
                      tone="secondary"
                      className="text-[13px]"
                      numberOfLines={2}
                    >
                      {trip.summary || t("trips.noSummary")}
                    </AppText>
                    <AppText tone="muted" className="text-[12px]">
                      {t("tripDetail.daysCount", {
                        count: trip.days?.length ?? 0,
                      })}
                    </AppText>
                  </View>
                  <View className="flex-row gap-2">
                    <Pressable
                      onPress={() => onRestore(trip)}
                      disabled={restoringId === trip.id}
                      className="flex-1 h-11 rounded-full items-center justify-center"
                      style={{
                        backgroundColor: theme.buttonPrimary,
                        opacity: restoringId === trip.id ? 0.5 : 1,
                      }}
                    >
                      <AppText
                        className="text-[14px] font-semibold"
                        style={{ color: theme.buttonText }}
                      >
                        {restoringId === trip.id
                          ? t("trash.restoring")
                          : t("trash.restore")}
                      </AppText>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        Haptics.selectionAsync();
                        router.push({
                          pathname: "/trip-detail",
                          params: { tripId: trip.id },
                        } as Href);
                      }}
                      className="h-11 px-4 rounded-full items-center justify-center border"
                      style={{ borderColor: theme.border }}
                    >
                      <AppText
                        tone="secondary"
                        className="text-[14px] font-semibold"
                      >
                        {t("trash.open")}
                      </AppText>
                    </Pressable>
                  </View>
                </View>
              </Swipeable>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  swipeClip: {
    borderRadius: 24,
    overflow: "hidden",
  },
  deleteAction: {
    flex: 1,
    backgroundColor: "#FF3B30",
    justifyContent: "center",
    alignItems: "flex-end",
    paddingRight: 0,
  },
  deleteIconWrap: {
    width: DELETE_ACTION_W,
    alignItems: "center",
    justifyContent: "center",
  },
});
