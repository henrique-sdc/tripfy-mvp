// Card de roteiro Em Alta — carrossel (Home) ou lista (/trending).

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Href, router } from "expo-router";
import { useTranslation } from "react-i18next";

import { AppText } from "@/components/ui/AppText";
import {
  type TrendingItinerary,
  trendingWizardHref,
} from "@/constants/trending";
import { useTheme } from "@/hooks/use-theme";
import { useWishlistStore } from "@/stores/wishlistStore";
import { Pressable, View } from "@/tw";

type Props = {
  item: TrendingItinerary;
  /** Largura do card no carrossel da Home. */
  width?: number;
  /** `carousel` = Home; `list` = tela Em Alta. */
  variant?: "carousel" | "list";
};

export function TrendingItineraryCard({
  item,
  width = 260,
  variant = "carousel",
}: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const toggle = useWishlistStore((s) => s.toggle);
  const saved = useWishlistStore((s) => s.has(item.id));

  const title = t(item.titleKey);
  const author = t(item.authorKey);
  const isList = variant === "list";
  const imageH = isList ? width * 0.42 : width * 0.48;

  function saveToWishlist() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggle({
      id: item.id,
      kind: "itinerary",
      title,
      image: item.image,
      subtitle: author,
    });
  }

  function createTrip() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push(trendingWizardHref(item) as Href);
  }

  // View puro: Pressable no wrapper roubava o scroll do carrossel.
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
      <View style={{ height: imageH }}>
        <Image
          source={{ uri: item.image }}
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
        />
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
      <View className={isList ? "p-4 gap-2" : "p-3.5 gap-2"}>
        <AppText
          className={isList ? "text-[16px] font-bold" : "text-[15px] font-bold"}
          numberOfLines={2}
        >
          {title}
        </AppText>
        <AppText tone="secondary" className="text-[12px]">
          {author}
        </AppText>
        {item.daysHint != null ? (
          <AppText tone="muted" className="text-[11px]">
            {t("trending.daysHint", { count: item.daysHint })}
          </AppText>
        ) : null}

        <View className="flex-row gap-2 mt-1">
          <Pressable
            onPress={saveToWishlist}
            accessibilityRole="button"
            accessibilityLabel={
              saved ? t("home.trending.saved") : t("trending.saveA11y")
            }
            className="h-11 rounded-full items-center justify-center px-3 border"
            style={{
              borderColor: theme.border,
              backgroundColor: theme.background,
            }}
          >
            <Ionicons
              name={saved ? "heart" : "heart-outline"}
              size={20}
              color={saved ? theme.accent : theme.textSecondary}
            />
          </Pressable>
          <Pressable
            onPress={createTrip}
            accessibilityRole="button"
            accessibilityLabel={t("trending.createA11y")}
            className="flex-1 h-11 rounded-full items-center justify-center"
            style={{ backgroundColor: theme.buttonPrimary }}
          >
            <AppText
              className="text-[13px] font-bold"
              style={{ color: theme.buttonText }}
            >
              {t("trending.createTrip")}
            </AppText>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
