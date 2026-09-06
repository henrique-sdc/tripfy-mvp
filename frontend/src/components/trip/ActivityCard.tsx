// Card rico de parada (RF07) — lazy load Places + visual Apple/Tripsy.
// Swipe/DnD ficam no trip-detail; este componente só renderiza o miolo visual.

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { AppText } from "@/components/ui/AppText";
import { useTheme } from "@/hooks/use-theme";
import {
  type ActivityResponse,
  getPlaceDetails,
  type PlaceDetailsResponse,
} from "@/lib/api";
import { buildGetYourGuideUrl } from "@/lib/affiliates";
import { openPartnerUrl } from "@/lib/openPartnerUrl";
import { buildPlacesLookupQuery } from "@/lib/placeDisplay";

const IMAGE_H = 168;
const RADIUS = 24;
const OVERLAY_TEXT = "#FFFFFF";

export type OpenPlaceDetailsPayload = {
  placeId: string | null;
  title: string;
  description: string;
  location: string;
  photoUrl: string | null;
};

type Props = {
  activity: ActivityResponse;
  /** Badge: índice do dia ou "Dia N" na vista Todos. */
  badgeLabel: string;
  /** Destino da viagem — query GetYourGuide (RF10). */
  destination?: string;
  showDragHandle?: boolean;
  onRemove?: () => void;
  /** Opacidade quando o item está sendo arrastado (ScaleDecorator). */
  dimmed?: boolean;
  /** Abre o Knowledge Panel (com fallback do roteiro se Places falhar). */
  onOpenDetails?: (payload: OpenPlaceDetailsPayload) => void;
  /** Abre modal de edição (time + title + description). */
  onEdit?: () => void;
  /** Inicia o drag no handle (mais confiável que long-press no card inteiro). */
  onDragHandlePressIn?: () => void;
};

export function ActivityCard({
  activity,
  destination,
  badgeLabel,
  showDragHandle = false,
  onRemove,
  dimmed = false,
  onOpenDetails,
  onEdit,
  onDragHandlePressIn,
}: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const reduceMotion = useReducedMotion();

  const [details, setDetails] = useState<PlaceDetailsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageReady, setImageReady] = useState(false);

  const shimmer = useSharedValue(0.45);
  const photoOpacity = useSharedValue(0);

  const placeId = details?.place_id ?? null;

  function openDetails() {
    if (!onOpenDetails) return;
    // Sempre abre — mesmo sem place_id o sheet mostra título/descrição do roteiro.
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onOpenDetails({
      placeId,
      title: activity.title,
      description: activity.description,
      location: activity.location,
      photoUrl: details?.photo_url ?? null,
    });
  }

  useEffect(() => {
    if (reduceMotion) {
      shimmer.value = 0.5;
      return;
    }
    // Pulso contínuo do skeleton — linear/inOut, nunca ease-in (Emil).
    shimmer.value = withRepeat(
      withTiming(0.7, {
        duration: 900,
        easing: Easing.inOut(Easing.quad),
      }),
      -1,
      true,
    );
  }, [reduceMotion, shimmer]);

  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: shimmer.value,
  }));

  const photoStyle = useAnimatedStyle(() => ({
    opacity: photoOpacity.value,
  }));

  useEffect(() => {
    // Título + endereço: endereço sozinho (ex. "Cl. 82 #12 -21") casa pin genérico.
    const query = buildPlacesLookupQuery(activity.title, activity.location);
    if (query.length < 2) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    photoOpacity.value = 0;
    setImageReady(false);

    (async () => {
      setLoading(true);
      try {
        const result = await getPlaceDetails(
          query,
          activity.latitude,
          activity.longitude,
          controller.signal,
        );
        if (!cancelled) setDetails(result);
      } catch (err) {
        if (cancelled || controller.signal.aborted) return;
        console.warn("[ActivityCard] Places lookup falhou:", err);
        if (!cancelled) setDetails(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    activity.title,
    activity.location,
    activity.latitude,
    activity.longitude,
    photoOpacity,
  ]);

  const photoUrl = details?.photo_url ?? null;
  const showPhoto = Boolean(photoUrl) && imageReady;
  // Reserva altura da hero enquanto busca ou enquanto há URL pra pintar.
  const showHero = loading || Boolean(photoUrl);

  function onPhotoLoad() {
    setImageReady(true);
    photoOpacity.value = reduceMotion
      ? 1
      : withTiming(1, {
          duration: 220,
          easing: Easing.out(Easing.cubic),
        });
  }

  const editBtn = onEdit ? (
    <Pressable
      onPress={onEdit}
      hitSlop={10}
      accessibilityLabel={t("tripDetail.editActivity.title")}
      style={showPhoto ? styles.removeBtn : undefined}
    >
      <Ionicons
        name="create-outline"
        size={showPhoto ? 18 : 20}
        color={showPhoto ? "rgba(255,255,255,0.9)" : theme.textSecondary}
      />
    </Pressable>
  ) : null;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
          opacity: dimmed ? 0.92 : 1,
        },
      ]}
    >
      {showHero ? (
        <Pressable
          onPress={onOpenDetails ? openDetails : undefined}
          disabled={!onOpenDetails}
          style={styles.hero}
        >
          {loading || !imageReady ? (
            <Animated.View
              style={[
                styles.heroFill,
                { backgroundColor: theme.border },
                shimmerStyle,
              ]}
            />
          ) : null}

          {photoUrl ? (
            <Animated.View style={[StyleSheet.absoluteFill, photoStyle]}>
              <Image
                source={{ uri: photoUrl }}
                style={styles.heroFill}
                contentFit="cover"
                transition={0}
                onLoad={onPhotoLoad}
                onError={() => {
                  setImageReady(false);
                  photoOpacity.value = 0;
                  setDetails((prev) =>
                    prev ? { ...prev, photo_url: null } : prev,
                  );
                }}
              />
              <LinearGradient
                colors={[
                  "transparent",
                  "rgba(0,0,0,0.55)",
                  "rgba(0,0,0,0.78)",
                ]}
                locations={[0, 0.45, 1]}
                style={styles.heroGradient}
              />
            </Animated.View>
          ) : null}

          {showPhoto ? (
            <View style={styles.heroMeta} pointerEvents="box-none">
              <View style={styles.heroTopRow}>
                <View style={styles.heroTopLeft}>
                  <View
                    style={[
                      styles.badge,
                      { backgroundColor: "rgba(255,255,255,0.22)" },
                    ]}
                  >
                    <AppText
                      className="text-[11px] font-bold"
                      style={{ color: OVERLAY_TEXT }}
                    >
                      {badgeLabel}
                    </AppText>
                  </View>
                  <AppText
                    className="text-[12px] font-semibold"
                    style={{ color: OVERLAY_TEXT }}
                  >
                    {activity.time}
                  </AppText>
                  {showDragHandle ? (
                    <Pressable
                      onPressIn={onDragHandlePressIn}
                      hitSlop={12}
                      accessibilityLabel={t("tripDetail.dragHandle")}
                    >
                      <Ionicons
                        name="menu"
                        size={16}
                        color="rgba(255,255,255,0.7)"
                      />
                    </Pressable>
                  ) : null}
                </View>
                <View style={styles.heroTopRight}>
                  {details?.rating != null ? (
                    <View style={styles.ratingPill}>
                      <Ionicons name="star" size={12} color="#F5C518" />
                      <AppText
                        className="text-[12px] font-bold"
                        style={{ color: OVERLAY_TEXT }}
                      >
                        {details.rating.toFixed(1)}
                      </AppText>
                    </View>
                  ) : null}
                  {editBtn}
                  {onRemove ? (
                    <Pressable
                      onPress={onRemove}
                      hitSlop={10}
                      accessibilityLabel={t("tripDetail.removeActivity")}
                      style={styles.removeBtn}
                    >
                      <Ionicons
                        name="close"
                        size={18}
                        color="rgba(255,255,255,0.9)"
                      />
                    </Pressable>
                  ) : null}
                </View>
              </View>

              <AppText
                className="text-[17px] font-bold"
                style={{ color: OVERLAY_TEXT, letterSpacing: -0.3 }}
                numberOfLines={2}
              >
                {activity.title}
              </AppText>

              {details?.open_now === true ? (
                <AppText tone="success" className="text-[12px] font-semibold">
                  {t("tripDetail.openNow")}
                </AppText>
              ) : details?.open_now === false ? (
                <AppText
                  className="text-[12px] font-medium"
                  style={{ color: "rgba(255,255,255,0.72)" }}
                >
                  {t("tripDetail.closedNow")}
                </AppText>
              ) : null}
            </View>
          ) : null}
        </Pressable>
      ) : null}

      <Pressable
        onPress={!showPhoto && onOpenDetails ? openDetails : undefined}
        disabled={showPhoto || !onOpenDetails}
        style={styles.body}
      >
        {!showPhoto ? (
          <View style={styles.bodyHeader}>
            <View style={styles.heroTopLeft}>
              <View
                style={[styles.badge, { backgroundColor: `${theme.accent}22` }]}
              >
                <AppText tone="accent" className="text-[11px] font-bold">
                  {badgeLabel}
                </AppText>
              </View>
              <AppText tone="accent" className="text-[12px] font-semibold">
                {activity.time}
              </AppText>
              {showDragHandle ? (
                <Pressable
                  onPressIn={onDragHandlePressIn}
                  hitSlop={12}
                  accessibilityLabel={t("tripDetail.dragHandle")}
                >
                  <Ionicons name="menu" size={16} color={theme.textMuted} />
                </Pressable>
              ) : null}
              {details?.rating != null ? (
                <View style={styles.ratingInline}>
                  <Ionicons name="star" size={12} color="#F5C518" />
                  <AppText className="text-[12px] font-semibold">
                    {details.rating.toFixed(1)}
                  </AppText>
                </View>
              ) : null}
            </View>
            <View style={styles.heroTopRight}>
              {editBtn}
              {onRemove ? (
                <Pressable
                  onPress={onRemove}
                  hitSlop={10}
                  accessibilityLabel={t("tripDetail.removeActivity")}
                >
                  <Ionicons
                    name="close"
                    size={20}
                    color={theme.textSecondary}
                  />
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}

        {!showPhoto ? (
          <AppText className="text-[15px] font-semibold" numberOfLines={2}>
            {activity.title}
          </AppText>
        ) : null}

        {!showPhoto && details?.open_now === true ? (
          <AppText tone="success" className="text-[12px] font-semibold">
            {t("tripDetail.openNow")}
          </AppText>
        ) : null}
        {!showPhoto && details?.open_now === false ? (
          <AppText tone="secondary" className="text-[12px]">
            {t("tripDetail.closedNow")}
          </AppText>
        ) : null}

        <AppText tone="secondary" className="text-[13px] leading-5">
          {activity.description}
        </AppText>

        <View style={styles.locationRow}>
          <Ionicons name="location-outline" size={14} color={theme.textMuted} />
          <AppText
            tone="muted"
            className="text-[12px] flex-1"
            numberOfLines={1}
          >
            {activity.location}
          </AppText>
          {details?.reviews_count != null && details.reviews_count > 0 ? (
            <AppText tone="muted" className="text-[11px]">
              {t("tripDetail.reviewsCount", { count: details.reviews_count })}
            </AppText>
          ) : null}
        </View>

        {activity.requires_ticket ? (
          <Pressable
            onPress={() => {
              const q = [activity.title, destination?.trim()]
                .filter(Boolean)
                .join(" ");
              void openPartnerUrl(buildGetYourGuideUrl(q));
            }}
            hitSlop={6}
            accessibilityRole="link"
            accessibilityLabel={t("tripDetail.partners.ticketsA11y", {
              title: activity.title,
            })}
            style={styles.ticketRow}
          >
            <Ionicons name="ticket-outline" size={14} color={theme.accent} />
            <AppText tone="accent" className="text-[12px] font-semibold">
              {t("tripDetail.partners.tickets")}
            </AppText>
          </Pressable>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS,
    overflow: "hidden",
  },
  hero: {
    height: IMAGE_H,
    width: "100%",
    backgroundColor: "#1c1c1e",
  },
  heroFill: {
    ...StyleSheet.absoluteFill,
    width: "100%",
    height: "100%",
  },
  heroGradient: {
    ...StyleSheet.absoluteFill,
  },
  heroMeta: {
    ...StyleSheet.absoluteFill,
    justifyContent: "flex-end",
    paddingHorizontal: 14,
    paddingBottom: 12,
    gap: 4,
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  heroTopLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 1,
  },
  heroTopRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  ratingPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  ratingInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  removeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  body: {
    padding: 14,
    gap: 6,
  },
  bodyHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  ticketRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
    alignSelf: "flex-start",
  },
});
