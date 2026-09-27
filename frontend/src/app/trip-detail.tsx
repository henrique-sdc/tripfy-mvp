// Trip Detail — mapa OSM em cima + lista DnD embaixo (RF07).
// Google Maps no Expo Go = bege; usamos OpenStreetMap via WebView.
// Persistência: auto-save no Firestore (sem coração manual).

import * as Haptics from "@/lib/haptics";
import { Ionicons } from "@expo/vector-icons";
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
} from "react-native";
import DraggableFlatList, {
  RenderItemParams,
  ScaleDecorator,
} from "react-native-draggable-flatlist";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Swipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CapsuleSelector } from "@/components/onboarding/CapsuleSelector";
import { ActivityCard } from "@/components/trip/ActivityCard";
import { AddActivityModal } from "@/components/trip/AddActivityModal";
import { EditActivityModal } from "@/components/trip/EditActivityModal";
import {
  EditDayTitleModal,
  EditTripMetaModal,
} from "@/components/trip/EditTripMetaModal";
import { PartnerReserveRow } from "@/components/trip/PartnerReserveRow";
import { PlaceDetailsSheet } from "@/components/trip/PlaceDetailsSheet";
import {
  PresenceAvatars,
  presenceColorFor,
} from "@/components/trip/PresenceAvatars";
import {
  SyncIndicator,
  type SyncStatus,
} from "@/components/trip/SyncIndicator";
import { TripOsmMap } from "@/components/trip/TripOsmMap";
import { AppText } from "@/components/ui/AppText";
import { useCollabTrip, type CollabEnqueue } from "@/hooks/use-collab-trip";
import { useTheme } from "@/hooks/use-theme";
import { useTripPresence } from "@/hooks/use-trip-presence";
import { newActivityId } from "@/lib/activityId";
import type {
  ActivityResponse,
  ItineraryResponse,
  SavedTripApi,
} from "@/lib/api";
import { cloneTripApi, getTripApi, isPremiumRequired } from "@/lib/api";
import { appDeepLink } from "@/lib/deep-links";
import { relativeTimeParts } from "@/lib/formatRelativeTime";
import { openNativeMaps } from "@/lib/openNativeMaps";
import {
  peekPendingItinerary,
  peekPendingMatchId,
} from "@/lib/pendingItinerary";
import {
  defaultChromeMode,
  hasCompletedPlace,
  type TripChromeMode,
} from "@/lib/travelMode";
import { optionalIsoDate } from "@/lib/tripDates";
import { getTrip, saveTrip, type SavedTrip } from "@/lib/trips";
import { useAuthStore } from "@/stores/authStore";

const DELETE_ACTION_W = 76;
/** progress > 1 = overshoot; acima disso apaga como o Mail da Apple. */
const OVERSWIPE_DELETE_AT = 1.45;
/** Fração da área do mapa visível com o sheet recolhido. */
const MAP_PEEK_RATIO = 0.42;
const SHEET_SNAP = { duration: 240, easing: Easing.out(Easing.cubic) };
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
  /** Título de exibição; vazio = usa destination. */
  title: string;
  summary: string;
  tips: string[];
  notes: string;
  days: LocalDay[];
  start_date?: string;
  end_date?: string;
};

/** null = todos os dias; number = índice do dia em `days`. */
type DaySelection = null | number;

function stampKeys(raw: ItineraryResponse): LocalItinerary {
  return {
    destination: raw.destination,
    title: typeof raw.title === "string" ? raw.title.trim() : "",
    summary: raw.summary,
    tips: Array.isArray(raw.tips)
      ? raw.tips.map((t) => String(t).trim()).filter(Boolean)
      : [],
    notes: typeof raw.notes === "string" ? raw.notes : "",
    days: raw.days.map((d) => ({
      day: d.day,
      title: d.title,
      activities: d.activities.map((a) => {
        const id =
          typeof a.id === "string" && a.id.trim()
            ? a.id.trim()
            : newActivityId();
        return {
          ...a,
          id,
          dayNumber: d.day,
          key: id,
        };
      }),
    })),
    start_date: optionalIsoDate(raw.start_date),
    end_date: optionalIsoDate(raw.end_date),
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

/** "Henrique Teste" → "Henrique". O nome completo continua no perfil. */
function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] ?? "";
}

function changeNoticeText(
  t: (key: string, options?: Record<string, unknown>) => string,
  remote: {
    updated_by_name?: string;
    last_change?: string | null;
    last_change_day?: number | null;
  },
): string | null {
  const kind = remote.last_change;
  if (!kind) return null;
  const name =
    firstName(remote.updated_by_name ?? "") || t("tripDetail.presence.someone");
  return t(`tripDetail.collab.notice.${kind}`, {
    name,
    day: remote.last_change_day ?? "",
  });
}

function lastEditLine(
  t: (key: string, options?: Record<string, unknown>) => string,
  name: string,
  at: unknown,
): string | null {
  const who = firstName(name);
  if (!who) return null;
  const parts = relativeTimeParts(at);
  if (!parts || parts.key === "trips.relative.today") {
    return t("tripDetail.collab.editedNow", { name: who });
  }
  if (parts.key === "trips.relative.hours") {
    return t("tripDetail.collab.editedHours", {
      name: who,
      count: parts.count,
    });
  }
  if (parts.key === "trips.relative.days") {
    return t("tripDetail.collab.editedDays", { name: who, count: parts.count });
  }
  return t("tripDetail.collab.editedWeeks", { name: who, count: parts.count });
}

function displayTripTitle(
  itinerary: Pick<LocalItinerary, "title" | "destination"> | null,
  fallback: string,
): string {
  if (!itinerary) return fallback;
  return itinerary.title.trim() || itinerary.destination.trim() || fallback;
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
    title: itinerary.title.trim(),
    summary: itinerary.summary,
    tips: itinerary.tips,
    notes: itinerary.notes,
    days: itinerary.days.map((d) => ({
      day: d.day,
      title: d.title,
      activities: d.activities.map(({ key: _k, dayNumber: _d, ...a }) => a),
    })),
    start_date: itinerary.start_date,
    end_date: itinerary.end_date,
  };
}

function patchLocalActivity(
  itinerary: LocalItinerary,
  key: string,
  patch: Partial<LocalActivity>,
): LocalItinerary {
  return {
    ...itinerary,
    days: itinerary.days.map((d) => ({
      ...d,
      activities: d.activities.map((a) =>
        a.key === key ? { ...a, ...patch } : a,
      ),
    })),
  };
}

function reorderOp(day: number, activities: LocalActivity[]): CollabEnqueue {
  return {
    type: "reorder_day",
    coalesceKey: `reorder:${day}`,
    payload: {
      day,
      activity_ids: activities.map((activity) => activity.id || activity.key),
      times: Object.fromEntries(
        activities.map((activity) => [
          activity.id || activity.key,
          activity.time,
        ]),
      ),
    },
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
  const [detailsPlace, setDetailsPlace] = useState<{
    placeId: string | null;
    activityKey?: string;
    fallback: {
      title: string;
      description: string;
      location: string;
      photoUrl: string | null;
    };
  } | null>(null);
  const [editingActivityKey, setEditingActivityKey] = useState<string | null>(
    null,
  );
  const [editingMeta, setEditingMeta] = useState(false);
  const [editingDayTitle, setEditingDayTitle] = useState(false);
  const [addingActivity, setAddingActivity] = useState(false);
  // Visitante via deep link — sem auto-save / edição.
  const [readOnly, setReadOnly] = useState(false);
  // Sala do Match: um doc, ops no FastAPI, listener no doc do dono.
  const [collab, setCollab] = useState(false);
  const [ownerUid, setOwnerUid] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [focusedActivityId, setFocusedActivityId] = useState<string | null>(
    null,
  );
  const [editStamp, setEditStamp] = useState<{
    name: string;
    at: unknown;
  } | null>(null);
  const [liveNotice, setLiveNotice] = useState<string | null>(null);
  const [cloning, setCloning] = useState(false);
  const [chromeMode, setChromeMode] = useState<TripChromeMode>(() =>
    defaultChromeMode(resolveInitialItinerary(params.itinerary)?.start_date),
  );

  const tripIdRef = useRef(tripId);
  const matchIdRef = useRef<string | undefined>(
    peekPendingItinerary() ? (peekPendingMatchId() ?? undefined) : undefined,
  );
  const savingLock = useRef(false);
  const paywallBlocked = useRef(false);
  const itineraryRef = useRef(itinerary);
  useEffect(() => {
    itineraryRef.current = itinerary;
  }, [itinerary]);
  const persistNowRef = useRef(false);
  const chromeTouchedRef = useRef(false);
  const [saveTick, setSaveTick] = useState(0);
  const isPremium = useAuthStore((s) => s.isPremium);
  const user = useAuthStore((s) => s.user);

  const applyRemoteTrip = useCallback(
    (remote: SavedTrip) => {
      setItinerary(stampKeys(remote));
      setRevision(remote.revision ?? 0);
      if (remote.owner_uid) setOwnerUid(remote.owner_uid);
      setCollab(remote.collab === true);
      setDirty(false);
      setSyncStatus("saved");
      if (remote.updated_by_name || remote.updated_at) {
        setEditStamp({
          name: remote.updated_by_name?.trim() || "",
          at: remote.updated_at,
        });
      }
      if (remote.updated_by && remote.updated_by !== user?.uid) {
        const phrase = changeNoticeText(t, remote);
        if (phrase) setLiveNotice(phrase);
      }
    },
    [t, user?.uid],
  );

  const { enqueue, dragRef, releaseDrag } = useCollabTrip({
    enabled: collab && !readOnly && Boolean(tripId) && Boolean(ownerUid),
    tripId,
    ownerUid,
    initialRevision: revision,
    onRemote: applyRemoteTrip,
    onConflict: (code) => {
      const bodyKey =
        code === "activity_deleted"
          ? "tripDetail.collab.activityDeleted"
          : code === "last_activity"
            ? "tripDetail.cannotRemoveLastBody"
            : code === "last_day"
              ? "tripDetail.cannotDeleteLastDayBody"
              : "tripDetail.collab.conflictBody";
      Alert.alert(t("tripDetail.collab.conflictTitle"), t(bodyKey));
    },
    onStatus: setSyncStatus,
  });

  const peers = useTripPresence({
    enabled: collab && !readOnly,
    tripId,
    name: user?.displayName?.trim() || "",
    photoUrl: user?.photoURL ?? null,
    focusedActivityId,
  });

  useEffect(() => {
    if (!liveNotice) return;
    const id = setTimeout(() => setLiveNotice(null), 4000);
    return () => clearTimeout(id);
  }, [liveNotice]);
  const sheetPlaced = useRef(false);
  const peekH = useSharedValue(0);
  const mapH = useSharedValue(0);
  const mapStartH = useSharedValue(0);

  // Mantém o id atual pra auto-save sem recriar o effect a cada mudança.
  useEffect(() => {
    tripIdRef.current = tripId;
  }, [tripId]);

  // Abre viagem: dono (client SDK) ou visitante (API + trip_shares).
  useEffect(() => {
    const id = typeof params.tripId === "string" ? params.tripId : null;
    if (itinerary || !id) return;

    let cancelled = false;

    function adoptLoadedTrip(
      remote: SavedTrip | SavedTripApi,
      forceReadOnly?: boolean,
    ) {
      const stamped = stampKeys(remote);
      setItinerary(stamped);
      setTripId(remote.id);
      if (remote.match_id) matchIdRef.current = remote.match_id;
      const readOnlyFlag =
        forceReadOnly ??
        ("read_only" in remote ? Boolean(remote.read_only) : false);
      setReadOnly(readOnlyFlag);
      setCollab(Boolean(remote.collab) && !readOnlyFlag);
      setOwnerUid(remote.owner_uid ?? null);
      setRevision(remote.revision ?? 0);
      setEditStamp({
        name:
          typeof remote.updated_by_name === "string"
            ? remote.updated_by_name.trim()
            : "",
        at: remote.updated_at,
      });
      setSyncStatus("saved");
      setDirty(false);
      if (!chromeTouchedRef.current) {
        setChromeMode(defaultChromeMode(stamped.start_date));
      }
    }

    (async () => {
      setLoadingRemote(true);
      try {
        const remote = await getTrip(id);
        if (cancelled) return;
        if (remote?.role === "member") {
          const shared = await getTripApi(id);
          if (cancelled) return;
          adoptLoadedTrip(shared);
          return;
        }

        if (remote) {
          adoptLoadedTrip(remote, false);
          return;
        }

        // Não é do usuário (ou soft-deleted no client) — tenta API.
        const shared = await getTripApi(id);
        if (cancelled) return;
        adoptLoadedTrip(shared);
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

  // Auto-save: dirty → debounce → API (create) ou Firestore (update).
  useEffect(() => {
    if (isPremium && paywallBlocked.current) {
      paywallBlocked.current = false;
      setDirty(true);
    }
  }, [isPremium]);

  useEffect(() => {
    if (!itinerary || !dirty || loadingRemote || readOnly || collab) return;
    if (paywallBlocked.current) return;

    const snapshot = itinerary;
    const delay = persistNowRef.current ? 0 : AUTOSAVE_MS;
    persistNowRef.current = false;

    const timer = setTimeout(async () => {
      if (savingLock.current) return;
      savingLock.current = true;
      setSyncStatus("saving");
      try {
        const id = await saveTrip(
          toPersistable(snapshot),
          tripIdRef.current ?? undefined,
          matchIdRef.current ? { matchId: matchIdRef.current } : undefined,
        );
        setTripId(id);
        if (itineraryRef.current === snapshot) {
          setDirty(false);
          setSyncStatus("saved");
        } else {
          persistNowRef.current = true;
          setDirty(true);
        }
        console.info(`[trip-detail] Auto-save ok tripId=${id}`);
      } catch (err) {
        console.error("[trip-detail] Auto-save falhou:", err);
        setSyncStatus("error");
        if (isPremiumRequired(err)) {
          paywallBlocked.current = true;
          return;
        }
        const msg =
          err instanceof Error && /permission|insufficient/i.test(err.message)
            ? t("tripDetail.saveRulesHint")
            : t("tripDetail.saveErrorBody");
        Alert.alert(t("tripDetail.saveErrorTitle"), msg);
      } finally {
        savingLock.current = false;
        if (itineraryRef.current !== snapshot) {
          persistNowRef.current = true;
          setSaveTick((n) => n + 1);
        }
      }
    }, delay);

    return () => clearTimeout(timer);
  }, [itinerary, dirty, loadingRemote, readOnly, collab, t, saveTick]);

  const showingAll = daySelection === null;
  const travelMode = chromeMode === "travel";
  const planChrome = chromeMode === "plan" && !readOnly;
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

  function sheetHaptic() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  const sheetPan = Gesture.Pan()
    .activeOffsetY([-8, 8])
    .failOffsetX([-24, 24])
    .onBegin(() => {
      mapStartH.value = mapH.value;
    })
    .onUpdate((e) => {
      const max = peekH.value;
      // Puxar o grip pra cima (translationY < 0) encolhe o mapa.
      const next = mapStartH.value + e.translationY;
      mapH.value = Math.min(max, Math.max(0, next));
    })
    .onEnd((e) => {
      const max = peekH.value;
      let target = mapH.value < max / 2 ? 0 : max;
      if (e.velocityY < -900) target = 0;
      if (e.velocityY > 900) target = max;
      mapH.value = withTiming(target, SHEET_SNAP);
      runOnJS(sheetHaptic)();
    });

  const sheetTap = Gesture.Tap().onEnd(() => {
    const max = peekH.value;
    const next = mapH.value < max / 2 ? max : 0;
    mapH.value = withTiming(next, SHEET_SNAP);
    runOnJS(sheetHaptic)();
  });

  const sheetGesture = Gesture.Exclusive(sheetPan, sheetTap);

  const mapStyle = useAnimatedStyle(() => ({
    height: mapH.value,
  }));

  const patchItinerary = useCallback(
    (next: LocalItinerary) => {
      if (readOnly) return;
      setItinerary(next);
      if (collab) {
        setSyncStatus("saving");
        return;
      }
      setDirty(true);
      setSyncStatus("saving");
    },
    [readOnly, collab],
  );

  const onToggleCompleted = useCallback(
    (key: string, completed: boolean, placeId: string | null) => {
      if (!itinerary || readOnly) return;
      const pid = placeId?.trim() ?? "";
      persistNowRef.current = true;
      patchItinerary(
        patchLocalActivity(itinerary, key, {
          completed,
          ...(pid.length >= 10 ? { place_id: pid } : {}),
        }),
      );
      enqueue({
        type: "patch_activity",
        coalesceKey: `act:${key}`,
        payload: {
          activity_id: key,
          fields: {
            completed,
            ...(pid.length >= 10 ? { place_id: pid } : {}),
          },
        },
      });
      console.info(
        "[trip-detail] Parada %s marcada completed=%s",
        key,
        completed,
      );
    },
    [itinerary, readOnly, patchItinerary, enqueue],
  );

  const onPlaceIdResolved = useCallback(
    (key: string, placeId: string) => {
      if (!itinerary || readOnly) return;
      const pid = placeId.trim();
      if (pid.length < 10) return;
      const current = itinerary.days
        .flatMap((d) => d.activities)
        .find((a) => a.key === key);
      if (!current?.completed || current.place_id === pid) return;
      persistNowRef.current = true;
      patchItinerary(patchLocalActivity(itinerary, key, { place_id: pid }));
      enqueue({
        type: "patch_activity",
        coalesceKey: `act:${key}`,
        payload: { activity_id: key, fields: { place_id: pid } },
      });
      console.info("[trip-detail] place_id carimbado na parada %s", key);
    },
    [itinerary, readOnly, patchItinerary, enqueue],
  );

  const onNavigateActivity = useCallback(
    (item: LocalActivity) => {
      void (async () => {
        try {
          await openNativeMaps({
            latitude: item.latitude,
            longitude: item.longitude,
            label: [item.title, item.location].filter(Boolean).join(" "),
          });
        } catch (err) {
          console.warn("[trip-detail] Maps nativo falhou:", err);
          Alert.alert(
            t("tripDetail.travelMode.navigateErrorTitle"),
            t("tripDetail.travelMode.navigateErrorBody"),
          );
        }
      })();
    },
    [t],
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
    const link = appDeepLink(`/trip/${tripId}`);
    try {
      await Share.share({
        title: displayTripTitle(itinerary, t("tripDetail.fallbackTitle")),
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
      if (isPremiumRequired(err)) return;
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
      enqueue(reorderOp(currentDay.day, rescheduled));
    },
    [itinerary, showingAll, daySelection, currentDay, patchItinerary, enqueue],
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
      enqueue({
        type: "delete_activity",
        payload: { activity_id: key },
      });
      enqueue(reorderOp(day.day, rescheduled));
    },
    [itinerary, t, patchItinerary, enqueue],
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
      const source = moved;

      const safeTarget = Math.max(
        0,
        Math.min(targetDayIndex, itinerary.days.length - 1),
      );

      const nextDays =
        fromIdx === safeTarget
          ? itinerary.days.map((d, i) =>
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
            )
          : itinerary.days.map((d, i) => {
              if (i === fromIdx) {
                return {
                  ...d,
                  activities: d.activities.filter((a) => a.key !== key),
                };
              }
              if (i === safeTarget) {
                const withDay: LocalActivity = {
                  ...source,
                  dayNumber: d.day,
                };
                return {
                  ...d,
                  activities: sortByTime([...d.activities, withDay]),
                };
              }
              return d;
            });
      patchItinerary({ ...itinerary, days: nextDays });
      // Modal já é o "sair do campo". 700 ms junta o patch com o reorder.
      enqueue({
        type: "patch_activity",
        coalesceKey: `act:${key}`,
        debounceMs: 700,
        payload: {
          activity_id: key,
          fields: { time, title, description },
          ...(fromIdx !== safeTarget
            ? { to_day: itinerary.days[safeTarget].day }
            : {}),
        },
      });
      const touched = new Set([fromIdx, safeTarget]);
      for (const index of touched) {
        const day = nextDays[index];
        if (!day) continue;
        enqueue({ ...reorderOp(day.day, day.activities), debounceMs: 700 });
      }
      setEditingActivityKey(null);
    },
    [itinerary, patchItinerary, enqueue],
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

      const activityId = newActivityId();
      const activity: LocalActivity = {
        id: activityId,
        time: payload.time,
        title: payload.title,
        description: payload.description,
        location: payload.location,
        latitude: payload.latitude,
        longitude: payload.longitude,
        requires_ticket: false,
        completed: false,
        place_id: null,
        dayNumber: day.day,
        key: activityId,
      };
      const activities = sortByTime([...day.activities, activity]);

      patchItinerary({
        ...itinerary,
        days: itinerary.days.map((d, i) =>
          i === daySelection ? { ...d, activities } : d,
        ),
      });
      enqueue({
        type: "add_activity",
        payload: {
          day: day.day,
          index: activities.findIndex((item) => item.key === activityId),
          activity: {
            id: activityId,
            time: activity.time,
            title: activity.title,
            description: activity.description,
            location: activity.location,
            latitude: activity.latitude,
            longitude: activity.longitude,
            requires_ticket: false,
            completed: false,
            place_id: null,
          },
        },
      });
      enqueue(reorderOp(day.day, activities));
      setAddingActivity(false);
      console.info(
        "[trip-detail] Nova parada adicionada no dia",
        day.day,
        payload.latitude != null ? "com pin" : "sem pin",
      );
    },
    [itinerary, showingAll, daySelection, patchItinerary, enqueue],
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
    enqueue({
      type: "add_day",
      payload: { day: nextNum, title: t("tripDetail.newDayTitle") },
    });
    setDaySelection(nextDays.length - 1);
    console.info("[trip-detail] Novo dia adicionado:", nextNum);
  }, [itinerary, patchItinerary, enqueue, t]);

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
            enqueue({
              type: "delete_day",
              payload: { day: day.day },
            });
            setDaySelection(null);
            console.info("[trip-detail] Dia removido e reindexado");
          },
        },
      ],
    );
  }, [itinerary, showingAll, daySelection, patchItinerary, enqueue, t]);

  const onEditMeta = useCallback(
    (title: string, summary: string, notes: string) => {
      if (!itinerary) return;
      // Título separado do destino real — Places / foto continuam no destination.
      patchItinerary({ ...itinerary, title, summary, notes });
      enqueue({
        type: "patch_meta",
        coalesceKey: "meta",
        debounceMs: 700,
        payload: { title, summary, notes },
      });
      setEditingMeta(false);
    },
    [itinerary, patchItinerary, enqueue],
  );

  const onEditDayTitle = useCallback(
    (title: string) => {
      if (!itinerary || showingAll || daySelection === null) return;
      const day = itinerary.days[daySelection];
      patchItinerary({
        ...itinerary,
        days: itinerary.days.map((d, i) =>
          i === daySelection ? { ...d, title } : d,
        ),
      });
      if (day) {
        enqueue({
          type: "patch_meta",
          coalesceKey: `day-title:${day.day}`,
          debounceMs: 700,
          payload: { day_titles: [{ day: day.day, title }] },
        });
      }
      setEditingDayTitle(false);
      console.info("[trip-detail] Título do dia atualizado");
    },
    [itinerary, showingAll, daySelection, patchItinerary, enqueue],
  );

  useEffect(() => {
    if (!collab) return;
    setFocusedActivityId(editingActivityKey);
  }, [collab, editingActivityKey]);

  const renderActivity = useCallback(
    ({ item, drag, isActive, getIndex }: RenderItemParams<LocalActivity>) => {
      const index = getIndex() ?? 0;
      const canDrag = !showingAll && planChrome;
      const canDelete = planChrome && canDeleteActivity(item.key);

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
                  destination={itinerary?.destination}
                  badgeLabel={
                    showingAll
                      ? t("tripDetail.dayChip", { day: item.dayNumber })
                      : String(index + 1)
                  }
                  showDragHandle={canDrag}
                  dimmed={isActive}
                  travelMode={travelMode}
                  onDragHandlePressIn={canDrag ? drag : undefined}
                  onOpenDetails={(payload) =>
                    setDetailsPlace({
                      placeId: payload.placeId,
                      activityKey: item.key,
                      fallback: {
                        title: payload.title,
                        description: payload.description,
                        location: payload.location,
                        photoUrl: payload.photoUrl,
                      },
                    })
                  }
                  onEdit={
                    planChrome
                      ? () => {
                          Haptics.impactAsync(
                            Haptics.ImpactFeedbackStyle.Light,
                          );
                          setEditingActivityKey(item.key);
                        }
                      : undefined
                  }
                  onToggleCompleted={
                    travelMode && !readOnly
                      ? (done, pid) => onToggleCompleted(item.key, done, pid)
                      : undefined
                  }
                  onPlaceIdResolved={
                    !readOnly
                      ? (pid) => onPlaceIdResolved(item.key, pid)
                      : undefined
                  }
                  onNavigate={
                    travelMode ? () => onNavigateActivity(item) : undefined
                  }
                  presenceRing={(() => {
                    const others = peers.filter(
                      (peer) => peer.uid !== user?.uid,
                    );
                    const ringPeer = others.find(
                      (peer) => peer.focusedActivityId === item.key,
                    );
                    if (!ringPeer) return null;
                    return presenceColorFor(ringPeer.uid, peers, [
                      theme.presenceA,
                      theme.presenceB,
                    ]);
                  })()}
                />
              </RNPressable>
            </Swipeable>
          </RNView>
        </ScaleDecorator>
      );
    },
    [
      onRemove,
      t,
      showingAll,
      canDeleteActivity,
      planChrome,
      travelMode,
      readOnly,
      itinerary?.destination,
      onToggleCompleted,
      onPlaceIdResolved,
      onNavigateActivity,
      peers,
      user?.uid,
      theme.presenceA,
      theme.presenceB,
    ],
  );

  const reviewGate = useMemo(() => {
    const placeId = detailsPlace?.placeId ?? null;
    const locked = {
      canWrite: false,
      lock: t("tripDetail.travelMode.reviewLocked") as string | null,
    };
    if (!itinerary || readOnly) return locked;
    if (hasCompletedPlace(itinerary.days, placeId)) {
      return { canWrite: true, lock: null as string | null };
    }
    const source = detailsPlace?.activityKey
      ? itinerary.days
          .flatMap((d) => d.activities)
          .find((a) => a.key === detailsPlace.activityKey)
      : undefined;
    if (source?.completed && (!source.place_id || !placeId)) {
      return {
        canWrite: false,
        lock: t("tripDetail.travelMode.reviewNoPlace"),
      };
    }
    return locked;
  }, [itinerary, detailsPlace, readOnly, t]);

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
            // Volta pra origem (Viagens, Lixeira, etc.). Sem histórico → aba Viagens.
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace("/(tabs)/trips" as Href);
            }
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
              itinerary && planChrome
                ? () => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setEditingMeta(true);
                  }
                : undefined
            }
            disabled={!itinerary || !planChrome}
            accessibilityRole={itinerary && planChrome ? "button" : undefined}
            accessibilityLabel={
              itinerary && planChrome
                ? t("tripDetail.editTrip.title")
                : undefined
            }
          >
            <AppText
              className="text-[18px] font-bold"
              style={{ letterSpacing: -0.3 }}
              numberOfLines={1}
            >
              {displayTripTitle(itinerary, t("tripDetail.fallbackTitle"))}
            </AppText>
          </RNPressable>
          <AppText tone="secondary" className="text-[12px]">
            {itinerary
              ? t("tripDetail.daysCount", { count: itinerary.days.length })
              : t("tripDetail.subtitle")}
          </AppText>
          {collab && editStamp
            ? (() => {
                const line = lastEditLine(t, editStamp.name, editStamp.at);
                return line ? (
                  <AppText
                    tone="secondary"
                    className="text-[12px]"
                    numberOfLines={1}
                  >
                    {line}
                  </AppText>
                ) : null;
              })()
            : null}
        </RNView>

        {itinerary ? (
          <RNView style={styles.headerActions}>
            {collab ? (
              <PresenceAvatars
                peers={peers}
                colors={[theme.presenceA, theme.presenceB]}
                labelFor={(name) =>
                  t("tripDetail.presence.online", {
                    name: name || t("tripDetail.presence.someone"),
                  })
                }
              />
            ) : null}
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

      {liveNotice ? (
        <RNView
          style={[
            styles.changeNotice,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
            },
          ]}
          accessibilityLiveRegion="polite"
        >
          <AppText className="text-[13px] font-semibold" numberOfLines={2}>
            {liveNotice}
          </AppText>
        </RNView>
      ) : null}

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
          <RNView
            style={styles.body}
            onLayout={(e) => {
              const h = e.nativeEvent.layout.height;
              const peek = h * MAP_PEEK_RATIO;
              peekH.value = peek;
              if (!sheetPlaced.current) {
                sheetPlaced.current = true;
                mapH.value = peek;
              }
            }}
          >
            <Animated.View style={[styles.mapWrap, mapStyle]}>
              <TripOsmMap
                points={mapped}
                accentColor={theme.accent}
                fill
                dark={scheme === "dark"}
                emptyLabel={t("tripDetail.mapEmptyTitle")}
                emptyHint={t("tripDetail.mapEmptyBody")}
                emptyBg={theme.surface}
                mutedColor={theme.textMuted}
                textColor={theme.textPrimary}
              />
            </Animated.View>

            <RNView
              style={[styles.sheet, { backgroundColor: theme.background }]}
            >
              <GestureDetector gesture={sheetGesture}>
                <RNView
                  style={styles.grabberHit}
                  accessibilityRole="adjustable"
                  accessibilityLabel={t("tripDetail.sheetHandle")}
                >
                  <RNView
                    style={[
                      styles.grabber,
                      { backgroundColor: theme.textMuted },
                    ]}
                  />
                </RNView>
              </GestureDetector>

              <RNView
                style={styles.modeWrap}
                accessibilityLabel={t("tripDetail.travelMode.selectorA11y")}
              >
                <CapsuleSelector
                  compact
                  value={chromeMode}
                  onChange={(value) => {
                    chromeTouchedRef.current = true;
                    setChromeMode(value as TripChromeMode);
                  }}
                  options={[
                    {
                      value: "plan",
                      label: t("tripDetail.travelMode.plan"),
                    },
                    {
                      value: "travel",
                      label: t("tripDetail.travelMode.travel"),
                    },
                  ]}
                />
              </RNView>

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
                      backgroundColor: showingAll
                        ? theme.accent
                        : theme.surface,
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
                          backgroundColor: active
                            ? theme.accent
                            : theme.surface,
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
                {!planChrome ? null : (
                  <RNPressable
                    onPress={onAddDay}
                    style={[
                      styles.dayChip,
                      styles.dayChipGhost,
                      { borderColor: theme.border },
                    ]}
                    accessibilityLabel={t("tripDetail.addDay")}
                  >
                    <AppText
                      tone="secondary"
                      className="text-[12px] font-semibold"
                    >
                      {t("tripDetail.addDay")}
                    </AppText>
                  </RNPressable>
                )}
              </RNScrollView>

              <RNView style={styles.dayTitleRow}>
                <RNPressable
                  style={styles.dayTitle}
                  disabled={!planChrome}
                  onPress={
                    planChrome
                      ? () => {
                          Haptics.impactAsync(
                            Haptics.ImpactFeedbackStyle.Light,
                          );
                          if (showingAll) setEditingMeta(true);
                          else setEditingDayTitle(true);
                        }
                      : undefined
                  }
                  accessibilityRole={planChrome ? "button" : undefined}
                  accessibilityLabel={
                    planChrome
                      ? showingAll
                        ? t("tripDetail.editTrip.title")
                        : t("tripDetail.editDayTitle.title", {
                            day: currentDay?.day ?? 1,
                          })
                      : undefined
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
                  {planChrome ? (
                    <Ionicons
                      name="pencil-outline"
                      size={14}
                      color={theme.textMuted}
                      style={{ marginTop: 2 }}
                    />
                  ) : null}
                </RNPressable>
                {planChrome && !showingAll && itinerary.days.length > 1 ? (
                  <RNPressable
                    onPress={onDeleteDay}
                    hitSlop={10}
                    style={styles.deleteDayBtn}
                    accessibilityLabel={t("tripDetail.deleteDayConfirm")}
                  >
                    <Ionicons
                      name="trash-outline"
                      size={18}
                      color={theme.error}
                    />
                  </RNPressable>
                ) : null}
              </RNView>

              {/* Notas pessoais — toque abre o modal de meta da viagem. */}
              {!readOnly || itinerary.notes.trim() ? (
                <RNPressable
                  onPress={
                    planChrome
                      ? () => {
                          Haptics.impactAsync(
                            Haptics.ImpactFeedbackStyle.Light,
                          );
                          setEditingMeta(true);
                        }
                      : undefined
                  }
                  disabled={!planChrome}
                  style={[
                    styles.notesRow,
                    {
                      borderColor: theme.border,
                      backgroundColor: theme.surface,
                    },
                  ]}
                  accessibilityRole={planChrome ? "button" : undefined}
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
                    {itinerary.notes.trim() ||
                      t(
                        collab
                          ? "tripDetail.notes.sharedEmpty"
                          : "tripDetail.notes.empty",
                      )}
                  </AppText>
                </RNPressable>
              ) : null}

              <DraggableFlatList
                data={activities}
                keyExtractor={(item) => item.key}
                onDragBegin={() => {
                  if (!planChrome) return;
                  dragRef.current = true;
                  setFocusedActivityId(null);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                onDragEnd={({ data }) => {
                  if (!planChrome) return;
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  onReorder(data);
                  releaseDrag();
                }}
                containerStyle={styles.flex}
                contentContainerStyle={{
                  paddingBottom: insets.bottom + (planChrome ? 88 : 32),
                }}
                renderItem={renderActivity}
                activationDistance={showingAll || !planChrome ? 10_000 : 8}
                autoscrollThreshold={48}
                ListHeaderComponent={
                  <>
                    <PartnerReserveRow
                      destination={itinerary.destination}
                      startDate={itinerary.start_date}
                      endDate={itinerary.end_date}
                    />
                    {!showingAll && planChrome ? (
                      <AppText
                        tone="muted"
                        className="text-[11px]"
                        style={styles.dragHint}
                      >
                        {t("tripDetail.dragHint")}
                      </AppText>
                    ) : !showingAll && travelMode ? (
                      <AppText
                        tone="muted"
                        className="text-[11px]"
                        style={styles.dragHint}
                      >
                        {t("tripDetail.travelMode.hint")}
                      </AppText>
                    ) : (
                      <RNView style={{ height: 8 }} />
                    )}
                  </>
                }
                ListFooterComponent={
                  <TripTipsFooter tips={itinerary.tips} theme={theme} t={t} />
                }
              />
            </RNView>
          </RNView>

          {planChrome ? (
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
        placeId={detailsPlace?.placeId ?? null}
        fallback={detailsPlace?.fallback ?? null}
        canWriteReview={reviewGate.canWrite}
        reviewLockMessage={reviewGate.lock}
        onClose={() => setDetailsPlace(null)}
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
        initialTitle={displayTripTitle(
          itinerary,
          t("tripDetail.fallbackTitle"),
        )}
        place={itinerary?.destination ?? ""}
        initialSummary={itinerary?.summary ?? ""}
        initialNotes={itinerary?.notes ?? ""}
        sharedNotes={collab}
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
  body: { flex: 1, overflow: "hidden" },
  mapWrap: {
    width: "100%",
    overflow: "hidden",
  },
  sheet: {
    flex: 1,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
  },
  grabberHit: {
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 6,
  },
  grabber: {
    width: 36,
    height: 5,
    borderRadius: 3,
  },
  modeWrap: {
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
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
  changeNotice: {
    marginHorizontal: 16,
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
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
    marginBottom: 8,
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
