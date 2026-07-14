// Salvos — bucket list. Trash visível em cada card (copia acidental = fácil remover).

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import { Alert, useColorScheme, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTabBarPadding } from "@/components/navigation/FloatingTabBar";
import { AppText } from "@/components/ui/AppText";
import { useTheme } from "@/hooks/use-theme";
import { useWishlistStore } from "@/stores/wishlistStore";
import { Pressable, ScrollView, View } from "@/tw";

export default function SavedScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const scheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const tabPad = useTabBarPadding();
  const { width } = useWindowDimensions();
  const items = useWishlistStore((s) => s.items);
  const remove = useWishlistStore((s) => s.remove);

  const gap = 10;
  const pad = 24;
  const colW = (width - pad * 2 - gap) / 2;

  function confirmRemove(id: string, title: string) {
    Alert.alert(t("saved.removeTitle"), t("saved.removeBody", { title }), [
      { text: t("saved.removeCancel"), style: "cancel" },
      {
        text: t("saved.removeConfirm"),
        style: "destructive",
        onPress: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          remove(id);
        },
      },
    ]);
  }

  return (
    <View className="flex-1" style={{ backgroundColor: theme.background }}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingTop: insets.top + 16,
          paddingBottom: tabPad,
          paddingHorizontal: pad,
        }}
        contentInsetAdjustmentBehavior="never"
      >
        <AppText
          className="font-bold mb-1"
          style={{ fontSize: 28, letterSpacing: -0.5 }}
        >
          {t("saved.title")}
        </AppText>
        <AppText tone="secondary" className="text-[14px] mb-6">
          {t("saved.subtitle")}
        </AppText>

        {items.length === 0 ? (
          <View
            className="items-center justify-center rounded-3xl border border-dashed py-16 px-6 gap-3"
            style={{ borderColor: theme.border }}
          >
            <Ionicons name="heart-outline" size={40} color={theme.textMuted} />
            <AppText className="text-[16px] font-semibold text-center">
              {t("saved.emptyTitle")}
            </AppText>
            <AppText
              tone="secondary"
              className="text-[13px] text-center leading-5"
            >
              {t("saved.emptyBody")}
            </AppText>
          </View>
        ) : (
          <View className="flex-row flex-wrap" style={{ gap }}>
            {items.map((item, i) => {
              const tall = i % 3 === 0;
              const h = tall ? colW * 1.35 : colW * 1.05;
              return (
                <View
                  key={item.id}
                  style={{ width: colW, height: h }}
                  className="rounded-2xl overflow-hidden"
                >
                  <Image
                    source={{ uri: item.image }}
                    style={{ width: "100%", height: "100%" }}
                    contentFit="cover"
                  />
                  <LinearGradient
                    colors={["transparent", "rgba(0,0,0,0.75)"]}
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      bottom: 0,
                      height: "50%",
                    }}
                  />

                  <Pressable
                    onPress={() => confirmRemove(item.id, item.title)}
                    hitSlop={8}
                    accessibilityLabel={t("saved.removeA11y")}
                    className="absolute top-2 right-2 w-8 h-8 rounded-full items-center justify-center"
                    style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
                  >
                    <Ionicons name="trash-outline" size={15} color="#fff" />
                  </Pressable>

                  <View className="absolute left-2.5 right-2.5 bottom-2.5 gap-0.5">
                    <AppText
                      className="text-[13px] font-bold"
                      style={{ color: "#fff" }}
                      numberOfLines={2}
                    >
                      {item.title}
                    </AppText>
                    {item.subtitle ? (
                      <AppText
                        className="text-[11px]"
                        style={{ color: "rgba(255,255,255,0.75)" }}
                        numberOfLines={1}
                      >
                        {item.subtitle}
                      </AppText>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
