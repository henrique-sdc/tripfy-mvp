// Trip Detail — mapa OSM em cima + lista DnD embaixo (RF07).
// Google Maps no Expo Go = bege; usamos OpenStreetMap via WebView.
// Persistência: auto-save no Firestore (sem coração manual).

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Href, router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Pressable as RNPressable,
  ScrollView as RNScrollView,
  View as RNView,
  Share,
  StyleSheet,
  useColorScheme,
  useWindowDimensions,
} from "react-native";
import DraggableFlatList, {
  RenderItemParams,
  ScaleDecorator,
} from "react-native-draggable-flatlist";
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
import { AddActivityModal } from "@/components/trip/AddActivityModal";
import { EditActivityModal } from "@/components/trip/EditActivityModal";
import {
  EditDayTitleModal,
  EditTripMetaModal,
} from "@/components/trip/EditTripMetaModal";
import { PlaceDetailsSheet } from "@/components/trip/PlaceDetailsSheet";
import {
  SyncIndicator,
  type SyncStatus,
} from "@/components/trip/SyncIndicator";
import { TripOsmMap } from "@/components/trip/TripOsmMap";
import { AppText } from "@/components/ui/AppText";
import { useTheme } from "@/hooks/use-theme";
import type { ActivityResponse, ItineraryResponse } from "@/lib/api";
import { cloneTripApi, getTripApi } from "@/lib/api";
import { peekPendingItinerary } from "@/lib/pendingItinerary";
import { getTrip, saveTrip } from "@/lib/trips";

const DELETE_ACTION_W = 76;
/** progress > 1 = overshoot; acima disso apaga como o Mail da Apple. */
const OVERSWIPE_DELETE_AT = 1.45;
/** Debounce do auto-save — evita gravar a cada pixel do drag. */
const AUTOSAVE_MS = 700;

type LocalActivity = ActivityResponse & { key: string; dayNumber: number };
type LocalDay = {
  day: number;
  title: string;
  activities: LocalActivity[];
};
type LocalItinerary = {
  destination: string;
  summary: string;
  tips: string[];
  notes: string;
  days: LocalDay[];
};

/** null = todos os dias; number = índice do dia em `days`. */
type DaySelection = null | number;

function stampKeys(raw: ItineraryResponse): LocalItinerary {
  return {
    destination: raw.destination,
    summary: raw.summary,
    tips: Array.isArray(raw.tips)
      ? raw.tips.map((t) => String(t).trim()).filter(Boolean)
      : [],
    notes: typeof raw.notes === "string" ? raw.notes : "",
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
    tips: itinerary.tips,
    notes: itinerary.notes,
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

/** Ordena paradas pelo horário (cross-day / nova parada). */
function sortByTime(activities: LocalActivity[]): LocalActivity[] {
  return [...activities].sort((a, b) =>
    a.time.localeCompare(b.time, undefined, { numeric: true }),
  );
}

function reindexDays(days: LocalDay[]): LocalDay[] {
  return days.map((d, i) => {
    const day = i + 1;
    return {
      day,
      title: d.title,
      activities: d.activities.map((a) => ({ ...a, dayNumber: day })),
    };
  });
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
    // Ícone sempre legível; só escala um pouco no overswipe (Mail).
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
      onPress={onDelete}
      style={styles.deleteAction}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {/* Zona fixa à direita — senão o ícone fica no meio do vermelho (flex). */}
      <Animated.View style={[styles.deleteIconWrap, iconStyle]}>
        <Ionicons name="trash" size={22} color="#FFFFFF" />
      </Animated.View>
    </RNPressable>
  );
}

/** Footer distinto das paradas — callout de dicas geradas pela LLM. */
function TripTipsFooter({
  tips,
  theme,
  t,
}: {
  tips: string[];
  theme: ReturnType<typeof useTheme>;
  t: (key: string) => string;
}) {
  if (tips.length === 0) return null;

  return (
    <RNView
      style={[
        styles.tipsCard,
        {
          backgroundColor: `${theme.accent}12`,
          borderColor: `${theme.accent}40`,
        },
      ]}
    >
      <RNView style={styles.tipsHeader}>
        <RNView
          style={[styles.tipsBadge, { backgroundColor: `${theme.accent}22` }]}
        >
          <Ionicons name="sparkles" size={14} color={theme.accent} />
        </RNView>
        <AppText
          className="text-[14px] font-bold"
          style={{ color: theme.accent, letterSpacing: -0.2 }}
        >
          {t("tripDetail.tips.title")}
        </AppText>
      </RNView>
      {tips.map((tip, i) => (
        <RNView key={`${i}-${tip.slice(0, 24)}`} style={styles.tipRow}>
          <AppText
            style={{ color: theme.accent, marginTop: 1 }}
            className="text-[13px] font-bold"
          >
            ·
          </AppText>
          <AppText
            className="text-[13px] leading-5 flex-1"
            style={{ color: theme.textPrimary }}
          >
            {tip}
          </AppText>
        </RNView>
      ))}
    </RNView>
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
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(
    typeof params.tripId === "string" ? "saved" : "saving",
  );
  const [dirty, setDirty] = useState(() => {
    // Roteiro recém-gerado (stash/SSE) precisa persistir na abertura.
    const hasPending = Boolean(peekPendingItinerary());
    const hasParamItinerary = Boolean(params.itinerary);
    const hasRemoteId = typeof params.tripId === "string";
    return (hasPending || hasParamItinerary) && !hasRemoteId;
  });
  const [loadingRemote, setLoadingRemote] = useState(
    !itinerary && Boolean(params.tripId),
  );
  const [detailsPlaceId, setDetailsPlaceId] = useState<string | null>(null);
  const [editingActivityKey, setEditingActivityKey] = useState<string | null>(
    null,
  );
  const [editingMeta, setEditingMeta] = useState(false);
  const [editingDayTitle, setEditingDayTitle] = useState(false);
  const [addingActivity, setAddingActivity] = useState(false);
  // Visitante via deep link — sem auto-save / edição.
  const [readOnly, setReadOnly] = useState(false);
  const [cloning, setCloning] = useState(false);

  const tripIdRef = useRef(tripId);
  const savingLock = useRef(false);

  // Mantém o id atual pra auto-save sem recriar o effect a cada mudança.
  useEffect(() => {
    tripIdRef.current = tripId;
  }, [tripId]);

  // Abre viagem: dono (client SDK) ou visitante (API + trip_shares).
  useEffect(() => {
    const id = typeof params.tripId === "string" ? params.tripId : null;
    if (itinerary || !id) return;

    let cancelled = false;
    (async () => {
      setLoadingRemote(true);
      try {
        const remote = await getTrip(id);
        if (cancelled) return;
        if (remote) {
          setItinerary(stampKeys(remote));
          setTripId(remote.id);
          setReadOnly(false);
          setSyncStatus("saved");
          setDirty(false);
          return;
        }

        // Não é do usuário (ou soft-deleted no client) — tenta API.
        const shared = await getTripApi(id);
        if (cancelled) return;
        setItinerary(stampKeys(shared));
        setTripId(shared.id);
        setReadOnly(shared.read_only);
        setSyncStatus("saved");
        setDirty(false);
      } catch (err) {
        console.error("[trip-detail] Falha ao carregar viagem:", err);
        Alert.alert(
          t("tripDetail.saveErrorTitle"),
          t("tripDetail.loadErrorBody"),
        );
        setSyncStatus("error");
      } finally {
        if (!cancelled) setLoadingRemote(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [itinerary, params.tripId, t]);

  // Auto-save: dirty → debounce → Firestore (cria ou atualiza).
  useEffect(() => {
    if (!itinerary || !dirty || loadingRemote || readOnly) return;

    const timer = setTimeout(async () => {
      if (savingLock.current) return;
      savingLock.current = true;
      setSyncStatus("saving");
      try {
        const id = await saveTrip(
          toPersistable(itinerary),
          tripIdRef.current ?? undefined,
        );
        setTripId(id);
        setDirty(false);
        setSyncStatus("saved");
        console.info(`[trip-detail] Auto-save ok tripId=${id}`);
      } catch (err) {
        console.error("[trip-detail] Auto-save falhou:", err);
        setSyncStatus("error");
        const msg =
          err instanceof Error && /permission|insufficient/i.test(err.message)
            ? t("tripDetail.saveRulesHint")
            : t("tripDetail.saveErrorBody");
        Alert.alert(t("tripDetail.saveErrorTitle"), msg);
      } finally {
        savingLock.current = false;
      }
    }, AUTOSAVE_MS);

    return () => clearTimeout(timer);
  }, [itinerary, dirty, loadingRemote, readOnly, t]);

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

  const patchItinerary = useCallback(
    (next: LocalItinerary) => {
      if (readOnly) return;
      setItinerary(next);
      setDirty(true);
      setSyncStatus("saving");
    },
    [readOnly],
  );

  async function onShare() {
    if (!tripId) {
      Alert.alert(
        t("tripDetail.shareNeedSaveTitle"),
        t("tripDetail.shareNeedSaveBody"),
      );
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const link = `tripfy://trip/${tripId}`;
    try {
      await Share.share({
        title: itinerary?.destination ?? t("tripDetail.fallbackTitle"),
        message: t("tripDetail.shareMessage", {
          destination: itinerary?.destination ?? "",
          link,
        }),
        url: link,
      });
    } catch (err) {
      console.warn("[trip-detail] Share cancelado/falhou:", err);
    }
  }

  async function onClone() {
    if (!tripId || cloning) return;
    setCloning(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const cloned = await cloneTripApi(tripId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace({
        pathname: "/trip-detail",
        params: { tripId: cloned.id },
      } as Href);
    } catch (err) {
      console.error("[trip-detail] Clone falhou:", err);
      Alert.alert(
        t("tripDetail.cloneErrorTitle"),
        t("tripDetail.cloneErrorBody"),
      );
    } finally {
      setCloning(false);
    }
  }

  const onReorder = useCallback(
    (data: LocalActivity[]) => {
      // Vista "Todos": reordenar entre dias misturaria horários — só no dia.
      if (!itinerary || showingAll || daySelection === null || !currentDay) {
        return;
      }
      const rescheduled = reassignTimes(currentDay.activities, data);
      patchItinerary({
        ...itinerary,
        days: itinerary.days.map((d, i) =>
          i === daySelection ? { ...d, activities: rescheduled } : d,
        ),
      });
    },
    [itinerary, showingAll, daySelection, currentDay, patchItinerary],
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
      patchItinerary({
        ...itinerary,
        days: itinerary.days.map((d, i) =>
          i === dayIdx ? { ...d, activities: rescheduled } : d,
        ),
      });
    },
    [itinerary, t, patchItinerary],
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

  const editingDayIndex = useMemo(() => {
    if (!itinerary || !editingActivityKey) return 0;
    const idx = itinerary.days.findIndex((d) =>
      d.activities.some((a) => a.key === editingActivityKey),
    );
    return idx >= 0 ? idx : 0;
  }, [itinerary, editingActivityKey]);

  const onEditActivity = useCallback(
    (
      key: string,
      time: string,
      title: string,
      description: string,
      targetDayIndex: number,
    ) => {
      if (!itinerary) return;

      let fromIdx = -1;
      let moved: LocalActivity | null = null;
      for (let i = 0; i < itinerary.days.length; i++) {
        const found = itinerary.days[i].activities.find((a) => a.key === key);
        if (found) {
          fromIdx = i;
          moved = { ...found, time, title, description };
          break;
        }
      }
      if (!moved || fromIdx < 0) return;

      const safeTarget = Math.max(
        0,
        Math.min(targetDayIndex, itinerary.days.length - 1),
      );

      if (fromIdx === safeTarget) {
        patchItinerary({
          ...itinerary,
          days: itinerary.days.map((d, i) =>
            i === fromIdx
              ? {
                  ...d,
                  activities: sortByTime(
                    d.activities.map((a) =>
                      a.key === key ? { ...a, time, title, description } : a,
                    ),
                  ),
                }
              : d,
          ),
        });
      } else {
        const targetDay = itinerary.days[safeTarget];
        const withDay: LocalActivity = {
          ...moved,
          dayNumber: targetDay.day,
        };
        patchItinerary({
          ...itinerary,
          days: itinerary.days.map((d, i) => {
            if (i === fromIdx) {
              return {
                ...d,
                activities: d.activities.filter((a) => a.key !== key),
              };
            }
            if (i === safeTarget) {
              return {
                ...d,
                activities: sortByTime([...d.activities, withDay]),
              };
            }
            return d;
          }),
        });
      }
      setEditingActivityKey(null);
    },
    [itinerary, patchItinerary],
  );

  const onAddActivity = useCallback(
    (payload: {
      time: string;
      title: string;
      description: string;
      location: string;
      latitude: number | null;
      longitude: number | null;
    }) => {
      if (!itinerary || showingAll || daySelection === null) return;
      const day = itinerary.days[daySelection];
      if (!day) return;

      const activity: LocalActivity = {
        time: payload.time,
        title: payload.title,
        description: payload.description,
        location: payload.location,
        latitude: payload.latitude,
        longitude: payload.longitude,
        dayNumber: day.day,
        key: `manual-${Date.now()}-${payload.title.slice(0, 12)}`,
      };

      patchItinerary({
        ...itinerary,
        days: itinerary.days.map((d, i) =>
          i === daySelection
            ? { ...d, activities: sortByTime([...d.activities, activity]) }
            : d,
        ),
      });
      setAddingActivity(false);
      console.info(
        "[trip-detail] Nova parada adicionada no dia",
        day.day,
        payload.latitude != null ? "com pin" : "sem pin",
      );
    },
    [itinerary, showingAll, daySelection, patchItinerary],
  );

  const onAddDay = useCallback(() => {
    if (!itinerary) return;
    const nextNum =
      itinerary.days.reduce((max, d) => Math.max(max, d.day), 0) + 1;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const nextDays: LocalDay[] = [
      ...itinerary.days,
      {
        day: nextNum,
        title: t("tripDetail.newDayTitle"),
        activities: [],
      },
    ];
    patchItinerary({ ...itinerary, days: nextDays });
    setDaySelection(nextDays.length - 1);
    console.info("[trip-detail] Novo dia adicionado:", nextNum);
  }, [itinerary, patchItinerary, t]);

  const onDeleteDay = useCallback(() => {
    if (!itinerary || showingAll || daySelection === null) return;
    if (itinerary.days.length <= 1) {
      Alert.alert(
        t("tripDetail.cannotDeleteLastDayTitle"),
        t("tripDetail.cannotDeleteLastDayBody"),
      );
      return;
    }

    const day = itinerary.days[daySelection];
    Alert.alert(
      t("tripDetail.deleteDayTitle"),
      t("tripDetail.deleteDayBody", { day: day.day }),
      [
        { text: t("tripDetail.stayHere"), style: "cancel" },
        {
          text: t("tripDetail.deleteDayConfirm"),
          style: "destructive",
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            const remaining = itinerary.days.filter(
              (_, i) => i !== daySelection,
            );
            patchItinerary({
              ...itinerary,
              days: reindexDays(remaining),
            });
            setDaySelection(null);
            console.info("[trip-detail] Dia removido e reindexado");
          },
        },
      ],
    );
  }, [itinerary, showingAll, daySelection, patchItinerary, t]);

  const onEditMeta = useCallback(
    (destination: string, summary: string, notes: string) => {
      if (!itinerary) return;
      patchItinerary({ ...itinerary, destination, summary, notes });
      setEditingMeta(false);
    },
    [itinerary, patchItinerary],
  );

  const onEditDayTitle = useCallback(
    (title: string) => {
      if (!itinerary || showingAll || daySelection === null) return;
      patchItinerary({
        ...itinerary,
        days: itinerary.days.map((d, i) =>
          i === daySelection ? { ...d, title } : d,
        ),
      });
      setEditingDayTitle(false);
      console.info("[trip-detail] Título do dia atualizado");
    },
    [itinerary, showingAll, daySelection, patchItinerary],
  );

  const renderActivity = useCallback(
    ({ item, drag, isActive, getIndex }: RenderItemParams<LocalActivity>) => {
      const index = getIndex() ?? 0;
      const canDrag = !showingAll && !readOnly;
      const canDelete = !readOnly && canDeleteActivity(item.key);

      return (
        <ScaleDecorator activeScale={1.03}>
          <RNView
            style={[styles.rowWrap, isActive ? styles.rowElevated : null]}
          >
            <Swipeable
              friction={2}
              rightThreshold={40}
              overshootRight
              overshootFriction={8}
              // Swipe só a partir da borda direita — vertical fica pro DnD.
              dragOffsetFromRightEdge={28}
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
                delayLongPress={180}
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
                  onDragHandlePressIn={canDrag ? drag : undefined}
                  onOpenDetails={(placeId) => setDetailsPlaceId(placeId)}
                  onEdit={
                    readOnly
                      ? undefined
                      : () => {
                          Haptics.impactAsync(
                            Haptics.ImpactFeedbackStyle.Light,
                          );
                          setEditingActivityKey(item.key);
                        }
                  }
                />
              </RNPressable>
            </Swipeable>
          </RNView>
        </ScaleDecorator>
      );
    },
    [onRemove, t, showingAll, canDeleteActivity, readOnly],
  );

  // Sem GestureHandlerRootView aqui: o _layout já envolve o app.
  // Root aninhado era o outro culpado do DnD parar no Android.
  return (
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
          <RNPressable
            onPress={
              itinerary && !readOnly
                ? () => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setEditingMeta(true);
                  }
                : undefined
            }
            disabled={!itinerary || readOnly}
            accessibilityRole={itinerary && !readOnly ? "button" : undefined}
            accessibilityLabel={
              itinerary && !readOnly
                ? t("tripDetail.editTrip.title")
                : undefined
            }
          >
            <AppText
              className="text-[18px] font-bold"
              style={{ letterSpacing: -0.3 }}
              numberOfLines={1}
            >
              {itinerary?.destination ?? t("tripDetail.fallbackTitle")}
            </AppText>
          </RNPressable>
          <AppText tone="secondary" className="text-[12px]">
            {itinerary
              ? t("tripDetail.daysCount", { count: itinerary.days.length })
              : t("tripDetail.subtitle")}
          </AppText>
        </RNView>

        {itinerary ? (
          <RNView style={styles.headerActions}>
            {readOnly ? (
              <RNPressable
                onPress={() => void onClone()}
                disabled={cloning}
                hitSlop={8}
                style={[
                  styles.cloneBtn,
                  {
                    backgroundColor: theme.buttonPrimary,
                    opacity: cloning ? 0.5 : 1,
                  },
                ]}
                accessibilityLabel={t("tripDetail.clone")}
              >
                <AppText
                  className="text-[12px] font-semibold"
                  style={{ color: theme.buttonText }}
                >
                  {cloning ? t("tripDetail.cloning") : t("tripDetail.clone")}
                </AppText>
              </RNPressable>
            ) : (
              <SyncIndicator status={syncStatus} />
            )}
            <RNPressable
              onPress={() => void onShare()}
              hitSlop={10}
              style={[styles.iconBtn, { backgroundColor: theme.surface }]}
              accessibilityLabel={t("tripDetail.share")}
            >
              <Ionicons
                name="share-outline"
                size={20}
                color={theme.textPrimary}
              />
            </RNPressable>
          </RNView>
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
                  key={`day-${d.day}-${i}`}
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
            {!readOnly ? (
              <RNPressable
                onPress={onAddDay}
                style={[
                  styles.dayChip,
                  styles.dayChipGhost,
                  { borderColor: theme.border },
                ]}
                accessibilityLabel={t("tripDetail.addDay")}
              >
                <AppText tone="secondary" className="text-[12px] font-semibold">
                  {t("tripDetail.addDay")}
                </AppText>
              </RNPressable>
            ) : null}
          </RNScrollView>

          <RNView style={styles.dayTitleRow}>
            <RNPressable
              style={styles.dayTitle}
              disabled={readOnly}
              onPress={
                readOnly
                  ? undefined
                  : () => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      if (showingAll) setEditingMeta(true);
                      else setEditingDayTitle(true);
                    }
              }
              accessibilityRole={readOnly ? undefined : "button"}
              accessibilityLabel={
                readOnly
                  ? undefined
                  : showingAll
                    ? t("tripDetail.editTrip.title")
                    : t("tripDetail.editDayTitle.title", {
                        day: currentDay?.day ?? 1,
                      })
              }
            >
              <AppText
                tone="secondary"
                className="text-[13px]"
                numberOfLines={2}
              >
                {showingAll
                  ? itinerary.summary || t("tripDetail.allDaysTitle")
                  : (currentDay?.title ?? "")}
              </AppText>
              {!readOnly ? (
                <Ionicons
                  name="pencil-outline"
                  size={14}
                  color={theme.textMuted}
                  style={{ marginTop: 2 }}
                />
              ) : null}
            </RNPressable>
            {!readOnly && !showingAll && itinerary.days.length > 1 ? (
              <RNPressable
                onPress={onDeleteDay}
                hitSlop={10}
                style={styles.deleteDayBtn}
                accessibilityLabel={t("tripDetail.deleteDayConfirm")}
              >
                <Ionicons name="trash-outline" size={18} color={theme.error} />
              </RNPressable>
            ) : null}
          </RNView>

          {/* Notas pessoais — toque abre o modal de meta da viagem. */}
          {!readOnly || itinerary.notes.trim() ? (
            <RNPressable
              onPress={
                readOnly
                  ? undefined
                  : () => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setEditingMeta(true);
                    }
              }
              disabled={readOnly}
              style={[
                styles.notesRow,
                { borderColor: theme.border, backgroundColor: theme.surface },
              ]}
              accessibilityRole={readOnly ? undefined : "button"}
              accessibilityLabel={t("tripDetail.notes.a11y")}
            >
              <Ionicons
                name="create-outline"
                size={16}
                color={theme.textMuted}
              />
              <AppText
                tone={itinerary.notes.trim() ? "secondary" : "muted"}
                className="text-[12px]"
                style={{ flex: 1 }}
                numberOfLines={2}
              >
                {itinerary.notes.trim() || t("tripDetail.notes.empty")}
              </AppText>
            </RNPressable>
          ) : null}

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
              if (readOnly) return;
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
            onDragEnd={({ data }) => {
              if (readOnly) return;
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onReorder(data);
            }}
            containerStyle={styles.flex}
            contentContainerStyle={{
              paddingBottom: insets.bottom + (readOnly ? 32 : 88),
            }}
            renderItem={renderActivity}
            activationDistance={showingAll || readOnly ? 10_000 : 8}
            autoscrollThreshold={48}
            ListFooterComponent={
              <TripTipsFooter tips={itinerary.tips} theme={theme} t={t} />
            }
          />

          {!readOnly ? (
            <RNPressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                if (showingAll || daySelection === null) {
                  Alert.alert(
                    t("tripDetail.addStopPickDayTitle"),
                    t("tripDetail.addStopPickDayBody"),
                  );
                  return;
                }
                setAddingActivity(true);
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
          ) : null}
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
        initialDescription={editingActivity?.description ?? ""}
        initialDayIndex={editingDayIndex}
        days={
          itinerary?.days.map((d) => ({ day: d.day, title: d.title })) ?? []
        }
        onClose={() => setEditingActivityKey(null)}
        onSave={(time, title, description, dayIndex) => {
          if (editingActivityKey) {
            onEditActivity(
              editingActivityKey,
              time,
              title,
              description,
              dayIndex,
            );
          }
        }}
      />

      <AddActivityModal
        visible={addingActivity}
        destination={itinerary?.destination}
        onClose={() => setAddingActivity(false)}
        onSave={onAddActivity}
      />

      <EditTripMetaModal
        visible={editingMeta}
        initialDestination={itinerary?.destination ?? ""}
        initialSummary={itinerary?.summary ?? ""}
        initialNotes={itinerary?.notes ?? ""}
        onClose={() => setEditingMeta(false)}
        onSave={onEditMeta}
      />

      <EditDayTitleModal
        visible={editingDayTitle}
        dayNumber={currentDay?.day ?? 1}
        initialTitle={currentDay?.title ?? ""}
        onClose={() => setEditingDayTitle(false)}
        onSave={onEditDayTitle}
      />
    </RNView>
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
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCopy: { flex: 1, minWidth: 0 },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  cloneBtn: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  tipsCard: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 28,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: "dashed",
    gap: 10,
  },
  tipsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 2,
  },
  tipsBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  tipRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
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
  dayChipGhost: {
    backgroundColor: "transparent",
    borderStyle: "dashed",
  },
  dayTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingRight: 12,
    gap: 4,
  },
  dayTitle: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  notesRow: {
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  deleteDayBtn: {
    marginTop: 6,
    padding: 6,
  },
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
    // Preenche o vermelho revelado; ícone ancorado na direita (estilo Mail).
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
