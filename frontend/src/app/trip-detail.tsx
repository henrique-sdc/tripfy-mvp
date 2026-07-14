// Trip Detail — mapa OSM em cima + lista DnD embaixo (RF06/RF07).
// Google Maps no Expo Go = bege; usamos OpenStreetMap via WebView.

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Href, router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Pressable as RNPressable,
  ScrollView as RNScrollView,
  StyleSheet,
  useColorScheme,
  useWindowDimensions,
  View as RNView,
} from "react-native";
import DraggableFlatList, {
  RenderItemParams,
  ScaleDecorator,
} from "react-native-draggable-flatlist";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TripOsmMap } from "@/components/trip/TripOsmMap";
import { AppText } from "@/components/ui/AppText";
import { useTheme } from "@/hooks/use-theme";
import type { ActivityResponse, ItineraryResponse } from "@/lib/api";
import { deleteTrip, getTrip, saveTrip } from "@/lib/trips";

type LocalActivity = ActivityResponse & { key: string };
type LocalDay = {
  day: number;
  title: string;
  activities: LocalActivity[];
};
type LocalItinerary = {
  destination: string;
  summary: string;
  days: LocalDay[];
};

function stampKeys(raw: ItineraryResponse): LocalItinerary {
  return {
    destination: raw.destination,
    summary: raw.summary,
    days: raw.days.map((d) => ({
      day: d.day,
      title: d.title,
      activities: d.activities.map((a, i) => ({
        ...a,
        key: `${d.day}-${i}-${a.time}-${a.title}`,
      })),
    })),
  };
}

function parseItinerary(
  raw: string | string[] | undefined,
): LocalItinerary | null {
  if (!raw) return null;
  const value = Array.isArray(raw) ? raw[0] : raw;
  try {
    const parsed = JSON.parse(value) as ItineraryResponse;
    if (!parsed?.destination || !Array.isArray(parsed.days)) return null;
    return stampKeys(parsed);
  } catch {
    return null;
  }
}

function hasCoords(a: LocalActivity): boolean {
  return (
    typeof a.latitude === "number" &&
    Number.isFinite(a.latitude) &&
    typeof a.longitude === "number" &&
    Number.isFinite(a.longitude)
  );
}

function toPersistable(itinerary: LocalItinerary): ItineraryResponse {
  return {
    destination: itinerary.destination,
    summary: itinerary.summary,
    days: itinerary.days.map((d) => ({
      day: d.day,
      title: d.title,
      activities: d.activities.map(({ key: _k, ...a }) => a),
    })),
  };
}

function reassignTimes(
  previous: LocalActivity[],
  reordered: LocalActivity[],
): LocalActivity[] {
  const slots = previous
    .map((a) => a.time)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return reordered.map((a, i) => ({
    ...a,
    time: slots[i] ?? a.time,
  }));
}

export default function TripDetailScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const scheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const params = useLocalSearchParams<{
    itinerary?: string;
    tripId?: string;
  }>();

  const fromParams = useMemo(
    () => parseItinerary(params.itinerary),
    [params.itinerary],
  );

  const [itinerary, setItinerary] = useState<LocalItinerary | null>(fromParams);
  const [dayIndex, setDayIndex] = useState(0);
  const [tripId, setTripId] = useState<string | null>(
    typeof params.tripId === "string" ? params.tripId : null,
  );
  const [saving, setSaving] = useState(false);
  const [loadingRemote, setLoadingRemote] = useState(
    !fromParams && Boolean(params.tripId),
  );

  // Abre viagem salva só com tripId (vindo da aba Viagens).
  useEffect(() => {
    const id = typeof params.tripId === "string" ? params.tripId : null;
    if (fromParams || !id) return;

    let cancelled = false;
    (async () => {
      setLoadingRemote(true);
      try {
        const remote = await getTrip(id);
        if (cancelled) return;
        if (!remote?.days?.length) {
          Alert.alert(
            t("tripDetail.emptyTitle"),
            t("tripDetail.emptyBody"),
          );
          return;
        }
        setItinerary(stampKeys(remote));
        setTripId(remote.id);
      } catch (err) {
        console.error("[trip-detail] Falha ao carregar viagem:", err);
        Alert.alert(
          t("tripDetail.saveErrorTitle"),
          t("tripDetail.loadErrorBody"),
        );
      } finally {
        if (!cancelled) setLoadingRemote(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fromParams, params.tripId, t]);

  const currentDay = itinerary?.days[dayIndex];
  const activities = currentDay?.activities ?? [];
  const mapped = useMemo(
    () =>
      activities.filter(hasCoords).map((a) => ({
        key: a.key,
        title: a.title,
        latitude: a.latitude as number,
        longitude: a.longitude as number,
      })),
    [activities],
  );

  const mapHeight = Math.max(200, Math.min(300, Math.round(winH * 0.34)));

  const onReorder = useCallback(
    (data: LocalActivity[]) => {
      if (!itinerary || !currentDay) return;
      Haptics.selectionAsync();
      const rescheduled = reassignTimes(currentDay.activities, data);
      setItinerary({
        ...itinerary,
        days: itinerary.days.map((d, i) =>
          i === dayIndex ? { ...d, activities: rescheduled } : d,
        ),
      });
    },
    [itinerary, currentDay, dayIndex],
  );

  const onRemove = useCallback(
    (key: string) => {
      if (!itinerary || !currentDay) return;
      if (currentDay.activities.length <= 1) {
        Alert.alert(
          t("tripDetail.cannotRemoveLastTitle"),
          t("tripDetail.cannotRemoveLastBody"),
        );
        return;
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const remaining = currentDay.activities.filter((a) => a.key !== key);
      const rescheduled = reassignTimes(remaining, remaining);
      setItinerary({
        ...itinerary,
        days: itinerary.days.map((d, i) =>
          i === dayIndex ? { ...d, activities: rescheduled } : d,
        ),
      });
    },
    [itinerary, currentDay, dayIndex, t],
  );

  async function onToggleSave() {
    if (!itinerary || saving) return;
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      if (tripId) {
        // Já salvo → atualiza edições (não remove no primeiro toque).
        await saveTrip(toPersistable(itinerary), tripId);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(
          t("tripDetail.updatedTitle"),
          t("tripDetail.updatedBody"),
          [
            { text: t("tripDetail.stayHere"), style: "cancel" },
            {
              text: t("tripDetail.goToTrips"),
              onPress: () => router.replace("/(tabs)/trips" as Href),
            },
          ],
        );
      } else {
        const id = await saveTrip(toPersistable(itinerary));
        setTripId(id);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(t("tripDetail.savedTitle"), t("tripDetail.savedBody"), [
          { text: t("tripDetail.stayHere"), style: "cancel" },
          {
            text: t("tripDetail.goToTrips"),
            onPress: () => router.replace("/(tabs)/trips" as Href),
          },
        ]);
      }
    } catch (err) {
      console.error("[trip-detail] Falha ao salvar roteiro:", err);
      const msg =
        err instanceof Error && /permission|insufficient/i.test(err.message)
          ? t("tripDetail.saveRulesHint")
          : t("tripDetail.saveErrorBody");
      Alert.alert(t("tripDetail.saveErrorTitle"), msg);
    } finally {
      setSaving(false);
    }
  }

  function onUnsave() {
    if (!tripId || saving) return;
    Alert.alert(t("tripDetail.unsaveTitle"), t("tripDetail.unsaveBody"), [
      { text: t("tripDetail.stayHere"), style: "cancel" },
      {
        text: t("tripDetail.unsave"),
        style: "destructive",
        onPress: async () => {
          setSaving(true);
          try {
            await deleteTrip(tripId);
            setTripId(null);
            Haptics.notificationAsync(
              Haptics.NotificationFeedbackType.Success,
            );
          } catch (err) {
            console.error("[trip-detail] Falha ao remover:", err);
            Alert.alert(
              t("tripDetail.saveErrorTitle"),
              t("tripDetail.saveErrorBody"),
            );
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  }

  const renderActivity = useCallback(
    ({ item, drag, isActive, getIndex }: RenderItemParams<LocalActivity>) => {
      const index = getIndex() ?? 0;
      return (
        <ScaleDecorator activeScale={1.03}>
          <RNPressable
            onLongPress={drag}
            disabled={isActive}
            delayLongPress={140}
            style={[
              styles.activityCard,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
                opacity: isActive ? 0.92 : 1,
              },
            ]}
          >
            <RNView style={styles.cardHeader}>
              <RNView style={styles.cardHeaderLeft}>
                <RNView
                  style={[
                    styles.stopBadge,
                    { backgroundColor: `${theme.accent}22` },
                  ]}
                >
                  <AppText tone="accent" className="text-[11px] font-bold">
                    {index + 1}
                  </AppText>
                </RNView>
                <AppText tone="accent" className="text-[12px] font-semibold">
                  {item.time}
                </AppText>
                <Ionicons name="menu" size={16} color={theme.textMuted} />
              </RNView>
              <RNPressable
                onPress={() => onRemove(item.key)}
                hitSlop={10}
                accessibilityLabel={t("tripDetail.removeActivity")}
              >
                <Ionicons name="close" size={20} color={theme.textSecondary} />
              </RNPressable>
            </RNView>
            <AppText className="text-[15px] font-semibold">{item.title}</AppText>
            <AppText tone="secondary" className="text-[13px] leading-5">
              {item.description}
            </AppText>
            <RNView style={styles.locationRow}>
              <Ionicons
                name="location-outline"
                size={14}
                color={theme.textMuted}
              />
              <AppText tone="muted" className="text-[12px]" numberOfLines={1}>
                {item.location}
              </AppText>
            </RNView>
          </RNPressable>
        </ScaleDecorator>
      );
    },
    [theme, onRemove, t],
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <RNView style={[styles.root, { backgroundColor: theme.background }]}>
        <StatusBar style={scheme === "dark" ? "light" : "dark"} />

        <RNView
          style={[
            styles.header,
            {
              paddingTop: insets.top + 8,
              borderBottomColor: theme.border,
              backgroundColor: theme.background,
            },
          ]}
        >
          <RNPressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.replace("/(tabs)");
            }}
            hitSlop={12}
            style={[styles.iconBtn, { backgroundColor: theme.surface }]}
            accessibilityLabel={t("tripDetail.close")}
          >
            <Ionicons name="close" size={22} color={theme.textPrimary} />
          </RNPressable>

          <RNView style={styles.headerCopy}>
            <AppText
              className="text-[18px] font-bold"
              style={{ letterSpacing: -0.3 }}
              numberOfLines={1}
            >
              {itinerary?.destination ?? t("tripDetail.fallbackTitle")}
            </AppText>
            <AppText tone="secondary" className="text-[12px]">
              {itinerary
                ? t("tripDetail.daysCount", { count: itinerary.days.length })
                : t("tripDetail.subtitle")}
            </AppText>
          </RNView>

          {itinerary ? (
            <RNPressable
              onPress={onToggleSave}
              onLongPress={tripId ? onUnsave : undefined}
              disabled={saving}
              hitSlop={12}
              style={[styles.iconBtn, { backgroundColor: theme.surface }]}
              accessibilityLabel={
                tripId ? t("tripDetail.save") : t("tripDetail.save")
              }
            >
              <Ionicons
                name={tripId ? "heart" : "heart-outline"}
                size={22}
                color={tripId ? theme.accent : theme.textPrimary}
              />
            </RNPressable>
          ) : null}
        </RNView>

        {loadingRemote ? (
          <RNView style={styles.empty}>
            <AppText tone="secondary">{t("tripDetail.loading")}</AppText>
          </RNView>
        ) : !itinerary ? (
          <RNView style={styles.empty}>
            <AppText className="text-center text-[16px] font-semibold">
              {t("tripDetail.emptyTitle")}
            </AppText>
            <AppText tone="secondary" className="text-center text-[13px]">
              {t("tripDetail.emptyBody")}
            </AppText>
          </RNView>
        ) : (
          <>
            {/* Mapa FORA da FlatList — senão o gesto de drag morre. */}
            <TripOsmMap
              points={mapped}
              accentColor={theme.accent}
              height={mapHeight}
              dark={scheme === "dark"}
              emptyLabel={t("tripDetail.mapEmptyTitle")}
              emptyHint={t("tripDetail.mapEmptyBody")}
              emptyBg={theme.surface}
              mutedColor={theme.textMuted}
              textColor={theme.textPrimary}
            />

            <RNScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.dayChips}
              style={styles.dayChipsScroll}
            >
              {itinerary.days.map((d, i) => {
                const active = i === dayIndex;
                return (
                  <RNPressable
                    key={d.day}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setDayIndex(i);
                    }}
                    style={[
                      styles.dayChip,
                      {
                        backgroundColor: active ? theme.accent : theme.surface,
                        borderColor: active ? theme.accent : theme.border,
                      },
                    ]}
                  >
                    <AppText
                      className="text-[12px] font-semibold"
                      style={{
                        color: active ? "#fff" : theme.textSecondary,
                      }}
                    >
                      {t("tripDetail.dayChip", { day: d.day })}
                    </AppText>
                  </RNPressable>
                );
              })}
            </RNScrollView>

            {currentDay ? (
              <AppText
                tone="secondary"
                className="text-[13px]"
                style={styles.dayTitle}
                numberOfLines={2}
              >
                {currentDay.title}
              </AppText>
            ) : null}

            <AppText
              tone="muted"
              className="text-[11px]"
              style={styles.dragHint}
            >
              {t("tripDetail.dragHint")}
            </AppText>

            <DraggableFlatList
              data={activities}
              keyExtractor={(item) => item.key}
              onDragEnd={({ data }) => onReorder(data)}
              containerStyle={styles.flex}
              contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
              renderItem={renderActivity}
              activationDistance={8}
              autoscrollThreshold={48}
            />
          </>
        )}
      </RNView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCopy: { flex: 1 },
  dayChipsScroll: { flexGrow: 0, marginTop: 10 },
  dayChips: { paddingHorizontal: 16, alignItems: "center" },
  dayChip: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  dayTitle: { paddingHorizontal: 16, paddingTop: 8 },
  dragHint: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  activityCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 6,
    marginHorizontal: 16,
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  stopBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 8,
  },
});
