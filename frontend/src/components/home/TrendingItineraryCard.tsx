// Card de roteiro público — carrossel (Home) ou lista (Em alta).
// Foto via Places, igual ao card de Viagens. Toque abre o roteiro.

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Href, router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable as GHPressable } from "react-native-gesture-handler";

import { AppText } from "@/components/ui/AppText";
import { useTheme } from "@/hooks/use-theme";
import { ApiError, getPlaceDetails, setExploreSavedApi } from "@/lib/api";
import { useWishlistStore } from "@/stores/wishlistStore";
import { Pressable, View } from "@/tw";

export type PublicTripCardData = {
  id: string;
  title: string;
  destination: string;
  ownerName: string;
  dayCount: number;
};

type Props = {
  trip: PublicTripCardData;
  /** Largura do card no carrossel da Home. */
  width?: number;
  /** `carousel` = Home; `list` = tela Em Alta. */
  variant?: "carousel" | "list";
};

export function TrendingItineraryCard({
  trip,
  width = 260,
  variant = "carousel",
}: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const toggle = useWishlistStore((s) => s.toggle);
  const saved = useWishlistStore((s) => s.has(trip.id));
  const busy = useRef(false);

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const isList = variant === "list";
  const imageH = isList ? width * 0.42 : width * 0.48;
  const title = trip.title.trim() || trip.destination;
  const author = trip.ownerName.trim() || t("tripDetail.presence.someone");
  const meta =
    trip.dayCount > 0
      ? t("trending.cardMeta", { name: author, count: trip.dayCount })
      : t("trending.cardAuthor", { name: author });

  useEffect(() => {
    const query = trip.destination.trim();
    if (query.length < 2) {
      setPhotoUrl(null);
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    void getPlaceDetails(query, undefined, undefined, controller.signal)
      .then((place) => {
        if (!cancelled) setPhotoUrl(place.photo_url);
      })
      .catch((err: unknown) => {
        if (cancelled || controller.signal.aborted) return;
        console.warn("[explore] foto:", err);
        setPhotoUrl(null);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [trip.destination]);

  function openTrip() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/trip/${trip.id}` as Href);
  }

  async function onHeart() {
    if (busy.current) return;
    busy.current = true;
    const next = !saved;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const payload = {
      id: trip.id,
      kind: "itinerary" as const,
      title,
      image: photoUrl ?? "",
      subtitle: author,
    };
    toggle(payload);
    try {
      await setExploreSavedApi(trip.id, next);
    } catch (err) {
      toggle(payload);
      console.warn(
        "[explore] save:",
        err instanceof ApiError ? err.status : "falha",
      );
    } finally {
      busy.current = false;
    }
  }

  return (
    <View
      style={{
        width: isList ? "100%" : width,
        backgroundColor: theme.surface,
        borderColor: theme.border,
      }}
      className={
        isList
          ? "rounded-3xl overflow-hidden border"
          : "rounded-3xl overflow-hidden border mr-3"
      }
    >
      <GHPressable onPress={openTrip}>
        <View style={{ height: imageH, backgroundColor: theme.border }}>
          {photoUrl ? (
            <Image
              source={{ uri: photoUrl }}
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
            />
          ) : (
            <View className="flex-1 items-center justify-center">
              <Ionicons name="image-outline" size={28} color={theme.textMuted} />
            </View>
          )}
          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.4)"]}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: "50%",
            }}
          />
        </View>
        <View className={isList ? "p-4 gap-1" : "p-3.5 gap-1"}>
          <AppText
            className={isList ? "text-[16px] font-bold" : "text-[15px] font-bold"}
            numberOfLines={2}
          >
            {title}
          </AppText>
          <AppText tone="secondary" className="text-[12px]" numberOfLines={1}>
            {meta}
          </AppText>
        </View>
      </GHPressable>
      <Pressable
        onPress={() => void onHeart()}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={
          saved ? t("home.trending.saved") : t("trending.saveA11y")
        }
        className="absolute top-3 right-3 w-9 h-9 rounded-full items-center justify-center"
        style={{ backgroundColor: "rgba(0,0,0,0.35)" }}
      >
        <Ionicons
          name={saved ? "heart" : "heart-outline"}
          size={18}
          color={saved ? theme.accent : "#fff"}
        />
      </Pressable>
    </View>
  );
}
