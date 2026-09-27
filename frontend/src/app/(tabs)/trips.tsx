// Viagens — lista premium (cards Places + swipe Soft Delete + pull-to-refresh).

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import { Href, router, useFocusEffect } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTabBarPadding } from "@/components/navigation/FloatingTabBar";
import { CapsuleSelector } from "@/components/onboarding/CapsuleSelector";
import { TripHistoryCard } from "@/components/trip/TripHistoryCard";
import { AppText } from "@/components/ui/AppText";
import { SwipeToDelete } from "@/components/ui/SwipeToDelete";
import { useTheme } from "@/hooks/use-theme";
import { softDeleteTripApi } from "@/lib/api";
import { listTrips, softDeleteTrip, type SavedTrip } from "@/lib/trips";
import { useCreateTripSheetStore } from "@/stores/createTripSheetStore";
import {
  useOfflineTripsStore,
  type OfflineTripPin,
} from "@/stores/offlineTripsStore";
import { Pressable, View } from "@/tw";

function tripFromPin(pin: OfflineTripPin): SavedTrip {
  return {
    ...pin.trip,
    id: pin.trip.id,
    destination: pin.trip.destination,
    summary: pin.trip.summary ?? "",
    days: pin.trip.days,
    notes: pin.trip.notes ?? "",
  };
}

export default function TripsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const scheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const tabPad = useTabBarPadding();
  const openCreateSheet = useCreateTripSheetStore((s) => s.open);

  const [trips, setTrips] = useState<SavedTrip[]>([]);
  // Filtro local — Matches = docs com match_id (origem RF11/RF12).
  const [filter, setFilter] = useState<"all" | "matches" | "offline">("all");
  const offlinePins = useOfflineTripsStore((s) => s.pins);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(
    async (opts?: { refresh?: boolean }) => {
      const isRefresh = opts?.refresh === true;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const rows = await listTrips();
        setTrips(rows);
      } catch (err) {
        console.error("[trips] Falha ao listar:", err);
        setError(t("trips.loadError"));
        if (!isRefresh) setTrips([]);
      } finally {
        if (isRefresh) setRefreshing(false);
        else setLoading(false);
      }
    },
    [t],
  );

  useFocusEffect(
    useCallback(() => {
      void reload();
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

  function trashTrip(trip: SavedTrip) {
    if (trip.role === "member") {
      Alert.alert(t("trips.sharedDeleteTitle"), t("trips.sharedDeleteBody"));
      return;
    }
    // Otimista: some da lista na hora; soft-delete é reversível na lixeira.
    setTrips((prev) => prev.filter((x) => x.id !== trip.id));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    void (async () => {
      try {
        // Conjunta: a API também marca o ponteiro do convidado.
        if (trip.collab) await softDeleteTripApi(trip.id);
        else await softDeleteTrip(trip.id);
      } catch (err) {
        console.error("[trips] Soft delete falhou:", err);
        Alert.alert(t("trips.loadError"), t("trips.trashError"));
        void reload();
      }
    })();
  }

  const pinList = useMemo(
    () => Object.values(offlinePins),
    [offlinePins],
  );

  useEffect(() => {
    if (filter === "offline" && pinList.length === 0) setFilter("all");
  }, [filter, pinList.length]);

  const visibleTrips = useMemo(() => {
    if (filter === "matches") return trips.filter((trip) => trip.match_id);
    if (filter === "offline") {
      const byId = new Map(trips.map((trip) => [trip.id, trip]));
      return pinList.map(
        (pin) => byId.get(pin.trip.id) ?? tripFromPin(pin),
      );
    }
    return trips;
  }, [filter, trips, pinList]);

  const listHeader = useMemo(
    () => (
      <View className="mb-5">
        <AppText
          className="font-bold mb-1"
          style={{ fontSize: 28, letterSpacing: -0.5 }}
        >
          {t("trips.title")}
        </AppText>
        <AppText tone="secondary" className="text-[14px] mb-4">
          {t("trips.subtitle")}
        </AppText>
        <CapsuleSelector
          options={[
            { value: "all", label: t("trips.filterAll") },
            { value: "matches", label: t("trips.filterMatches") },
            ...(pinList.length > 0
              ? [{ value: "offline", label: t("trips.filterOffline") }]
              : []),
          ]}
          value={filter}
          onChange={(value) => {
            if (value === "all" || value === "matches" || value === "offline") {
              setFilter(value);
            }
          }}
        />
      </View>
    ),
    [filter, pinList.length, t],
  );

  function renderEmpty() {
    if (loading) {
      return (
        <View className="items-center py-16">
          <ActivityIndicator color={theme.accent} />
        </View>
      );
    }

    if (error) {
      return (
        <View
          className="items-center rounded-3xl border border-dashed py-14 px-6 gap-3"
          style={{ borderColor: theme.border }}
        >
          <AppText className="text-[15px] font-semibold text-center">
            {error}
          </AppText>
          <Pressable
            onPress={() => void reload()}
            className="mt-2 rounded-full px-4 py-2"
            style={{ backgroundColor: theme.accent }}
          >
            <AppText style={{ color: "#fff" }} className="font-semibold">
              {t("trips.retry")}
            </AppText>
          </Pressable>
        </View>
      );
    }

    const emptyKind =
      filter === "offline" ? "offline" : filter === "matches" ? "matches" : "saved";

    return (
      <View className="items-center justify-center py-20 px-4 gap-3">
        <Ionicons
          name={
            emptyKind === "offline"
              ? "cloud-offline-outline"
              : emptyKind === "matches"
                ? "people-outline"
                : "map-outline"
          }
          size={56}
          color={theme.textMuted}
        />
        <AppText className="text-[17px] font-semibold text-center">
          {t(
            emptyKind === "offline"
              ? "trips.emptyOffline"
              : emptyKind === "matches"
                ? "trips.emptyMatches"
                : "trips.emptySaved",
          )}
        </AppText>
        <AppText tone="secondary" className="text-[14px] text-center mb-2">
          {t(
            emptyKind === "offline"
              ? "trips.emptyOfflineHint"
              : emptyKind === "matches"
                ? "trips.emptyMatchesHint"
                : "trips.emptySavedHint",
          )}
        </AppText>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            openCreateSheet();
          }}
          className="rounded-full px-5 py-3"
          style={{ backgroundColor: theme.accent }}
          accessibilityRole="button"
          accessibilityLabel={t("trips.createCta")}
        >
          <AppText
            style={{ color: "#fff" }}
            className="font-semibold text-[15px]"
          >
            {t("trips.createCta")}
          </AppText>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1" style={{ backgroundColor: theme.background }}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <FlatList
        data={
          filter !== "offline" && (error || loading) ? [] : visibleTrips
        }
        keyExtractor={(item) => item.id}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={{
          paddingTop: insets.top + 16,
          paddingBottom: tabPad,
          paddingHorizontal: 24,
          flexGrow: 1,
        }}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void reload({ refresh: true })}
            tintColor={theme.accent}
            colors={[theme.accent]}
          />
        }
        renderItem={({ item }) =>
          item.role === "member" ||
          (filter === "offline" && !trips.some((trip) => trip.id === item.id)) ? (
            <TripHistoryCard trip={item} onPress={() => openTrip(item)} />
          ) : (
            <SwipeToDelete
              accessibilityLabel={t("trips.swipeDeleteA11y")}
              onDelete={() => trashTrip(item)}
            >
              <TripHistoryCard trip={item} onPress={() => openTrip(item)} />
            </SwipeToDelete>
          )
        }
      />
    </View>
  );
}
