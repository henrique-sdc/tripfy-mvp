// Viagens — lista real do Firestore (users/{uid}/trips).

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Href, router, useFocusEffect } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Alert, useColorScheme } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTabBarPadding } from "@/components/navigation/FloatingTabBar";
import { AppText } from "@/components/ui/AppText";
import { useTheme } from "@/hooks/use-theme";
import { listTrips, softDeleteTrip, type SavedTrip } from "@/lib/trips";
import { Pressable, ScrollView, View } from "@/tw";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const SPRING = { damping: 20, stiffness: 300 };

function TripCard({
  trip,
  onPress,
  onTrash,
}: {
  trip: SavedTrip;
  onPress: () => void;
  onTrash: () => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const days = trip.days?.length ?? 0;

  return (
    <AnimatedPressable
      onPress={onPress}
      onLongPress={() => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        onTrash();
      }}
      delayLongPress={420}
      onPressIn={() => {
        scale.value = withSpring(0.98, SPRING);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, SPRING);
      }}
      style={[
        style,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
        },
      ]}
      className="rounded-3xl border p-4 gap-2"
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-1">
          <AppText className="text-[17px] font-bold" numberOfLines={1}>
            {trip.destination || t("tripDetail.fallbackTitle")}
          </AppText>
          <AppText tone="secondary" className="text-[13px]" numberOfLines={2}>
            {trip.summary || t("trips.noSummary")}
          </AppText>
        </View>
        <Ionicons
          name="chevron-forward"
          size={18}
          color={theme.textSecondary}
        />
      </View>
      <AppText tone="muted" className="text-[12px]">
        {t("tripDetail.daysCount", { count: days })}
      </AppText>
    </AnimatedPressable>
  );
}

export default function TripsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const scheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const tabPad = useTabBarPadding();
  const [trips, setTrips] = useState<SavedTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listTrips();
      setTrips(rows);
    } catch (err) {
      console.error("[trips] Falha ao listar:", err);
      setError(t("trips.loadError"));
      setTrips([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  function openTrip(trip: SavedTrip) {
    // Só tripId — o detail busca no Firestore (evita truncar JSON na URL).
    const href = {
      pathname: "/trip-detail",
      params: { tripId: trip.id },
    } as unknown as Href;
    router.push(href);
  }

  function askTrash(trip: SavedTrip) {
    Alert.alert(
      t("trips.trashTitle"),
      t("trips.trashBody", { destination: trip.destination }),
      [
        { text: t("trips.trashCancel"), style: "cancel" },
        {
          text: t("trips.trashConfirm"),
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await softDeleteTrip(trip.id);
                setTrips((prev) => prev.filter((x) => x.id !== trip.id));
                Haptics.notificationAsync(
                  Haptics.NotificationFeedbackType.Success,
                );
              } catch (err) {
                console.error("[trips] Soft delete falhou:", err);
                Alert.alert(t("trips.loadError"), t("trips.trashError"));
              }
            })();
          },
        },
      ],
    );
  }

  return (
    <View className="flex-1" style={{ backgroundColor: theme.background }}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingTop: insets.top + 16,
          paddingBottom: tabPad,
          paddingHorizontal: 24,
        }}
        contentInsetAdjustmentBehavior="never"
      >
        <AppText
          className="font-bold mb-1"
          style={{ fontSize: 28, letterSpacing: -0.5 }}
        >
          {t("trips.title")}
        </AppText>
        <AppText tone="secondary" className="text-[14px] mb-5">
          {t("trips.subtitle")}
        </AppText>

        {loading ? (
          <View className="items-center py-16">
            <ActivityIndicator color={theme.accent} />
          </View>
        ) : error ? (
          <View
            className="items-center rounded-3xl border border-dashed py-14 px-6 gap-3"
            style={{ borderColor: theme.border }}
          >
            <AppText className="text-[15px] font-semibold text-center">
              {error}
            </AppText>
            <Pressable
              onPress={reload}
              className="mt-2 rounded-full px-4 py-2"
              style={{ backgroundColor: theme.accent }}
            >
              <AppText style={{ color: "#fff" }} className="font-semibold">
                {t("trips.retry")}
              </AppText>
            </Pressable>
          </View>
        ) : trips.length === 0 ? (
          <View
            className="items-center rounded-3xl border border-dashed py-14 px-6 gap-3"
            style={{ borderColor: theme.border }}
          >
            <Ionicons name="map-outline" size={36} color={theme.textMuted} />
            <AppText className="text-[15px] font-semibold text-center">
              {t("trips.emptySaved")}
            </AppText>
            <AppText tone="secondary" className="text-[13px] text-center">
              {t("trips.emptySavedHint")}
            </AppText>
          </View>
        ) : (
          <View className="gap-3">
            {trips.map((trip) => (
              <TripCard
                key={trip.id}
                trip={trip}
                onPress={() => openTrip(trip)}
                onTrash={() => askTrash(trip)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
