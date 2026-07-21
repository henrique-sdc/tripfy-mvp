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

import { ActivityCard } from "@/components/trip/ActivityCard";
import { EditActivityModal } from "@/components/trip/EditActivityModal";
import { PlaceDetailsSheet } from "@/components/trip/PlaceDetailsSheet";
import { TripOsmMap } from "@/components/trip/TripOsmMap";
import { AppText } from "@/components/ui/AppText";
import { useTheme } from "@/hooks/use-theme";
import type { ActivityResponse, ItineraryResponse } from "@/lib/api";
import { peekPendingItinerary } from "@/lib/pendingItinerary";
import { deleteTrip, getTrip, saveTrip } from "@/lib/trips";

const DELETE_ACTION_W = 76;
/** progress > 1 = overshoot; acima disso apaga como o Mail da Apple. */
const OVERSWIPE_DELETE_AT = 1.45;

type LocalActivity = ActivityResponse & { key: string; dayNumber: number };
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

/** null = todos os dias; number = índice do dia em `days`. */
type DaySelection = null | number;

function stampKeys(raw: ItineraryResponse): LocalItinerary {
  return {
    destination: raw.destination,
    summary: raw.summary,
    days: raw.days.map((d) => ({
      day: d.day,
      title: d.title,
      activities: d.activities.map((a, i) => ({
        ...a,
        dayNumber: d.day,
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
      activities: d.activities.map(({ key: _k, dayNumber: _d, ...a }) => a),
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

function resolveInitialItinerary(
  paramRaw: string | string[] | undefined,
): LocalItinerary | null {
  const pending = peekPendingItinerary();
  if (pending) return stampKeys(pending);
  return parseItinerary(paramRaw);
}

/** Ação vermelha do swipe — ícone escala com o progresso (feel físico). */
function SwipeDeleteAction({
  progress,
  onDelete,
  accessibilityLabel,
}: {
  progress: SharedValue<number>;
  onDelete: () => void;
  accessibilityLabel: string;
}) {
  const fired = useSharedValue(false);

  useAnimatedReaction(
    () => progress.value,
    (current) => {
      // Overswipe (progress > 1): apaga como o Mail — só uma vez por gesto.
      if (current >= OVERSWIPE_DELETE_AT && !fired.value) {
        fired.value = true;
        runOnJS(onDelete)();
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
      [0.55, 1, 1.28],
      Extrapolation.CLAMP,
    );
    const opacity = interpolate(
      progress.value,
      [0, 0.35, 1],
      [0, 0.55, 1],
      Extrapolation.CLAMP,
    );
    return { opacity, transform: [{ scale }] };
  });

  return (
    <RNPressable
      onPress={onDelete}
      style={styles.deleteAction}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Animated.View style={iconStyle}>
        <Ionicons name="trash" size={24} color="#FFFFFF" />
      </Animated.View>
    </RNPressable>
  );
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

  const [itinerary, setItinerary] = useState<LocalItinerary | null>(() =>
    resolveInitialItinerary(params.itinerary),
  );
  // Primeiro chip = todos os dias juntos.
  const [daySelection, setDaySelection] = useState<DaySelection>(null);
  const [tripId, setTripId] = useState<string | null>(
    typeof params.tripId === "string" ? params.tripId : null,
  );
  const [saving, setSaving] = useState(false);
  const [loadingRemote, setLoadingRemote] = useState(
    !itinerary && Boolean(params.tripId),
  );
  const [detailsPlaceId, setDetailsPlaceId] = useState<string | null>(null);
  const [editingActivityKey, setEditingActivityKey] = useState<string | null>(
    null,
  );

  // Abre viagem salva só com tripId (vindo da aba Viagens).
  useEffect(() => {
    const id = typeof params.tripId === "string" ? params.tripId : null;
    if (itinerary || !id) return;

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
  }, [itinerary, params.tripId, t]);

  const showingAll = daySelection === null;
  const currentDay =
    !showingAll && itinerary ? itinerary.days[daySelection] : undefined;

  const activities = useMemo(() => {
    if (!itinerary) return [];
    if (showingAll) {
      return itinerary.days.flatMap((d) => d.activities);
    }
    return currentDay?.activities ?? [];
  }, [itinerary, showingAll, currentDay]);

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
      // Vista "Todos": reordenar entre dias misturaria horários — só no dia.
      if (!itinerary || showingAll || daySelection === null || !currentDay) {
        return;
      }
      const rescheduled = reassignTimes(currentDay.activities, data);
      setItinerary({
        ...itinerary,
        days: itinerary.days.map((d, i) =>
          i === daySelection ? { ...d, activities: rescheduled } : d,
        ),
      });
    },
    [itinerary, showingAll, daySelection, currentDay],
  );

  const onRemove = useCallback(
    (key: string) => {
      if (!itinerary) return;

      const dayIdx = itinerary.days.findIndex((d) =>
        d.activities.some((a) => a.key === key),
      );
      if (dayIdx < 0) return;
      const day = itinerary.days[dayIdx];
      if (day.activities.length <= 1) {
        Alert.alert(
          t("tripDetail.cannotRemoveLastTitle"),
          t("tripDetail.cannotRemoveLastBody"),
        );
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const remaining = day.activities.filter((a) => a.key !== key);
      const rescheduled = reassignTimes(remaining, remaining);
      setItinerary({
        ...itinerary,
        days: itinerary.days.map((d, i) =>
          i === dayIdx ? { ...d, activities: rescheduled } : d,
        ),
      });
    },
    [itinerary, t],
  );

  const canDeleteActivity = useCallback(
    (key: string) => {
      if (!itinerary) return false;
      const day = itinerary.days.find((d) =>
        d.activities.some((a) => a.key === key),
      );
      return (day?.activities.length ?? 0) > 1;
    },
    [itinerary],
  );

  const editingActivity = useMemo(() => {
    if (!itinerary || !editingActivityKey) return null;
    for (const day of itinerary.days) {
      const found = day.activities.find((a) => a.key === editingActivityKey);
      if (found) return found;
    }
    return null;
  }, [itinerary, editingActivityKey]);

  const onEditActivity = useCallback(
    (key: string, time: string, title: string) => {
      if (!itinerary) return;
      setItinerary({
        ...itinerary,
        days: itinerary.days.map((d) => ({
          ...d,
          activities: d.activities.map((a) =>
            a.key === key ? { ...a, time, title } : a,
          ),
        })),
      });
      setEditingActivityKey(null);
    },
    [itinerary],
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
      const canDrag = !showingAll;
      const canDelete = canDeleteActivity(item.key);

      return (
        <ScaleDecorator activeScale={1.03}>
          <RNView style={[styles.rowWrap, isActive ? styles.rowElevated : null]}>
            <Swipeable
              friction={2}
              rightThreshold={40}
              overshootRight
              overshootFriction={8}
              dragOffsetFromRightEdge={24}
              enabled={!isActive && canDelete}
              containerStyle={isActive ? undefined : styles.swipeClip}
              renderRightActions={(progress, _translation, methods) => (
                <SwipeDeleteAction
                  progress={progress}
                  accessibilityLabel={t("tripDetail.removeActivity")}
                  onDelete={() => {
                    methods.close();
                    onRemove(item.key);
                  }}
                />
              )}
            >
              <RNPressable
                onLongPress={canDrag ? drag : undefined}
                disabled={isActive}
                delayLongPress={160}
              >
                <ActivityCard
                  activity={item}
                  badgeLabel={
                    showingAll
                      ? t("tripDetail.dayChip", { day: item.dayNumber })
                      : String(index + 1)
                  }
                  showDragHandle={canDrag}
                  dimmed={isActive}
                  onOpenDetails={(placeId) => setDetailsPlaceId(placeId)}
                  onEdit={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setEditingActivityKey(item.key);
                  }}
                />
              </RNPressable>
            </Swipeable>
          </RNView>
        </ScaleDecorator>
      );
    },
    [onRemove, t, showingAll, canDeleteActivity],
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
              <RNPressable
                onPress={() => {
                  Haptics.selectionAsync();
                  setDaySelection(null);
                }}
                style={[
                  styles.dayChip,
                  {
                    backgroundColor: showingAll ? theme.accent : theme.surface,
                    borderColor: showingAll ? theme.accent : theme.border,
                  },
                ]}
              >
                <AppText
                  className="text-[12px] font-semibold"
                  style={{
                    color: showingAll ? "#fff" : theme.textSecondary,
                  }}
                >
                  {t("tripDetail.allDaysChip")}
                </AppText>
              </RNPressable>
              {itinerary.days.map((d, i) => {
                const active = daySelection === i;
                return (
                  <RNPressable
                    key={d.day}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setDaySelection(i);
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

            <AppText
              tone="secondary"
              className="text-[13px]"
              style={styles.dayTitle}
              numberOfLines={2}
            >
              {showingAll
                ? itinerary.summary || t("tripDetail.allDaysTitle")
                : (currentDay?.title ?? "")}
            </AppText>

            {!showingAll ? (
              <AppText
                tone="muted"
                className="text-[11px]"
                style={styles.dragHint}
              >
                {t("tripDetail.dragHint")}
              </AppText>
            ) : (
              <RNView style={{ height: 8 }} />
            )}

            <DraggableFlatList
              data={activities}
              keyExtractor={(item) => item.key}
              onDragBegin={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              onDragEnd={({ data }) => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onReorder(data);
              }}
              containerStyle={styles.flex}
              contentContainerStyle={{
                paddingBottom: insets.bottom + 88,
              }}
              renderItem={renderActivity}
              activationDistance={showingAll ? 10_000 : 8}
              autoscrollThreshold={48}
            />

            <RNPressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                console.info("[trip-detail] Adicionar parada — em breve");
                Alert.alert(
                  t("tripDetail.addStopSoonTitle"),
                  t("tripDetail.addStopSoonBody"),
                );
              }}
              style={[
                styles.fab,
                {
                  bottom: insets.bottom + 16,
                  backgroundColor: theme.buttonPrimary,
                },
              ]}
              accessibilityLabel={t("tripDetail.addStop")}
            >
              <Ionicons name="add" size={20} color={theme.buttonText} />
              <AppText
                className="text-[14px] font-semibold"
                style={{ color: theme.buttonText }}
              >
                {t("tripDetail.addStop")}
              </AppText>
            </RNPressable>
          </>
        )}

        <PlaceDetailsSheet
          placeId={detailsPlaceId}
          onClose={() => setDetailsPlaceId(null)}
        />

        <EditActivityModal
          visible={editingActivity != null}
          initialTime={editingActivity?.time ?? ""}
          initialTitle={editingActivity?.title ?? ""}
          onClose={() => setEditingActivityKey(null)}
          onSave={(time, title) => {
            if (editingActivityKey) {
              onEditActivity(editingActivityKey, time, title);
            }
          }}
        />
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
  rowWrap: {
    marginHorizontal: 16,
    marginBottom: 12,
  },
  rowElevated: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 10,
    zIndex: 2,
  },
  swipeClip: {
    borderRadius: 24,
    overflow: "hidden",
  },
  deleteAction: {
    width: DELETE_ACTION_W,
    flex: 1,
    marginLeft: 8,
    borderRadius: 24,
    backgroundColor: "#FF3B30",
    alignItems: "center",
    justifyContent: "center",
  },
  fab: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 18,
    height: 48,
    borderRadius: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 8,
  },
});
