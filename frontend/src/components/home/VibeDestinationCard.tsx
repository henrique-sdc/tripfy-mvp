// Card de cidade da vibe. Toque gera o roteiro uma vez; coração fica na wishlist.

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { ActivityIndicator } from "react-native";
import { Pressable as GHPressable } from "react-native-gesture-handler";

import { AppText } from "@/components/ui/AppText";
import { useTheme } from "@/hooks/use-theme";
import { getPlaceDetails } from "@/lib/api";
import { useWishlistStore } from "@/stores/wishlistStore";
import { Pressable, View } from "@/tw";

type Props = {
  destination: string;
  reason: string;
  width: number;
  busy?: boolean;
  onPress: () => void;
};

export function VibeDestinationCard({
  destination,
  reason,
  width,
  busy = false,
  onPress,
}: Props) {
  const theme = useTheme();
  const saved = useWishlistStore((s) => s.has(destination));
  const toggle = useWishlistStore((s) => s.toggle);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const height = width * 0.62;

  useEffect(() => {
    const query = typeof destination === "string" ? destination.trim() : "";
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
      .catch(() => {
        if (!cancelled) setPhotoUrl(null);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [destination]);

  function onFavorite() {
    const title = typeof destination === "string" ? destination.trim() : "";
    if (!title) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    toggle({
      id: title,
      kind: "destination",
      title,
      image: photoUrl ?? "",
      subtitle: typeof reason === "string" ? reason : "",
    });
  }

  return (
    <GHPressable
      onPress={() => {
        if (busy) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={{ width, marginRight: 12 }}
    >
      <View
        style={{
          width,
          height,
          borderRadius: 24,
          overflow: "hidden",
          backgroundColor: theme.border,
        }}
      >
        {photoUrl ? (
          <Image
            source={{ uri: photoUrl }}
            style={{ width: "100%", height: "100%", borderRadius: 24 }}
            contentFit="cover"
            transition={200}
          />
        ) : null}
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.55)", "#000"]}
          locations={[0.3, 0.65, 1]}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            borderRadius: 24,
          }}
          pointerEvents="none"
        />
        {busy ? (
          <View className="absolute inset-0 items-center justify-center">
            <ActivityIndicator color="#fff" />
          </View>
        ) : null}
        <Pressable
          onPress={onFavorite}
          hitSlop={8}
          className="absolute top-3 right-3 w-9 h-9 rounded-full items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.35)" }}
        >
          <Ionicons
            name={saved ? "heart" : "heart-outline"}
            size={18}
            color={saved ? theme.accent : "#fff"}
          />
        </Pressable>
        <View className="absolute left-3 right-3 bottom-3 gap-0.5">
          <AppText
            className="text-[16px] font-bold"
            style={{ color: "#fff" }}
            numberOfLines={2}
          >
            {destination}
          </AppText>
          <AppText
            className="text-[12px]"
            style={{ color: "rgba(255,255,255,0.8)" }}
            numberOfLines={2}
          >
            {reason}
          </AppText>
        </View>
      </View>
    </GHPressable>
  );
}
