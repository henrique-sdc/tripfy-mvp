// Lista completa "Em Alta" — acessível pelo chevron da Home (RF08).

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import { useColorScheme, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText } from "@/components/ui/AppText";
import { TRENDING_ITINERARIES } from "@/constants/trending";
import { useTheme } from "@/hooks/use-theme";
import { useWishlistStore } from "@/stores/wishlistStore";
import { Pressable, ScrollView, View } from "@/tw";

export default function TrendingScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const scheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const toggle = useWishlistStore((s) => s.toggle);
  const has = useWishlistStore((s) => s.has);

  return (
    <View className="flex-1" style={{ backgroundColor: theme.background }}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />

      <View
        className="flex-row items-center px-4 pb-3 gap-3"
        style={{
          paddingTop: insets.top + 8,
          borderBottomWidth: 1,
          borderBottomColor: theme.border,
        }}
      >
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          hitSlop={12}
          className="w-10 h-10 rounded-full items-center justify-center"
          style={{ backgroundColor: theme.surface }}
        >
          <Ionicons name="chevron-back" size={22} color={theme.textPrimary} />
        </Pressable>
        <AppText className="text-[18px] font-bold flex-1">
          {t("trending.screenTitle")}
        </AppText>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: 24,
          paddingBottom: insets.bottom + 32,
          gap: 16,
        }}
        showsVerticalScrollIndicator={false}
      >
        <AppText tone="secondary" className="text-[14px] mb-1">
          {t("trending.screenSubtitle")}
        </AppText>

        {TRENDING_ITINERARIES.map((item) => {
          const title = t(item.titleKey);
          const author = t(item.authorKey);
          const saved = has(item.id);

          return (
            <View
              key={item.id}
              className="rounded-3xl overflow-hidden border"
              style={{
                backgroundColor: theme.surface,
                borderColor: theme.border,
              }}
            >
              <View style={{ height: width * 0.42 }}>
                <Image
                  source={{ uri: item.image }}
                  style={{ width: "100%", height: "100%" }}
                  contentFit="cover"
                />
                <LinearGradient
                  colors={["transparent", "rgba(0,0,0,0.45)"]}
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: 0,
                    height: "55%",
                  }}
                />
              </View>
              <View className="p-4 gap-2">
                <AppText className="text-[16px] font-bold">{title}</AppText>
                <AppText tone="secondary" className="text-[13px]">
                  {author}
                </AppText>
                <Pressable
                  onPress={() => {
                    Haptics.notificationAsync(
                      Haptics.NotificationFeedbackType.Success,
                    );
                    if (!saved) {
                      toggle({
                        id: item.id,
                        kind: "itinerary",
                        title,
                        image: item.image,
                        subtitle: author,
                      });
                    }
                  }}
                  className="mt-1 rounded-full py-3 items-center"
                  style={{ backgroundColor: `${theme.accent}18` }}
                >
                  <AppText tone="accent" className="text-[13px] font-bold">
                    {saved
                      ? t("home.trending.saved")
                      : t("home.trending.copy")}
                  </AppText>
                </Pressable>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
