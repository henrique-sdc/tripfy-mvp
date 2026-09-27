// Cópias offline neste aparelho. A viagem na conta não entra aqui.

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import { Alert, useColorScheme } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText } from "@/components/ui/AppText";
import { useTheme } from "@/hooks/use-theme";
import {
  clearOfflinePins,
  useOfflineTripsStore,
  type OfflineTripPin,
} from "@/stores/offlineTripsStore";
import { Pressable, ScrollView, View } from "@/tw";

function pinTitle(pin: OfflineTripPin): string {
  const custom = typeof pin.trip.title === "string" ? pin.trip.title.trim() : "";
  return custom || pin.trip.destination;
}

function pinBytes(pin: OfflineTripPin): number {
  const json = JSON.stringify(pin);
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(json).length;
  }
  return json.length;
}

function formatPinSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 10) return `${kb.toFixed(1)} KB`;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export default function OfflineTripsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const scheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const pins = useOfflineTripsStore((s) => s.pins);
  const unpin = useOfflineTripsStore((s) => s.unpin);
  const list = Object.values(pins);

  function removeOne(pin: OfflineTripPin) {
    const title = pinTitle(pin) || t("tripDetail.fallbackTitle");
    Alert.alert(
      t("settings.offlineRemoveTitle"),
      t("settings.offlineRemoveBody", { title }),
      [
        { text: t("settings.offlineRemoveCancel"), style: "cancel" },
        {
          text: t("settings.offlineRemoveConfirm"),
          style: "destructive",
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            unpin(pin.trip.id);
          },
        },
      ],
    );
  }

  function removeAll() {
    Alert.alert(t("settings.offlineClearTitle"), t("settings.offlineClearBody"), [
      { text: t("settings.offlineRemoveCancel"), style: "cancel" },
      {
        text: t("settings.offlineClearConfirm"),
        style: "destructive",
        onPress: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          clearOfflinePins();
        },
      },
    ]);
  }

  return (
    <View className="flex-1" style={{ backgroundColor: theme.background }}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <View
        className="flex-row items-center px-6"
        style={{ paddingTop: insets.top + 8, paddingBottom: 8 }}
      >
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          hitSlop={12}
          className="w-10 h-10 rounded-full items-center justify-center mr-2"
          style={{ backgroundColor: theme.surface }}
          accessibilityLabel={t("editProfile.back")}
        >
          <Ionicons name="chevron-back" size={22} color={theme.textPrimary} />
        </Pressable>
        <AppText className="text-[20px] font-bold flex-1">
          {t("settings.offlineSection")}
        </AppText>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingBottom: insets.bottom + 32,
          gap: 12,
        }}
      >
        <AppText tone="secondary" className="text-[13px] leading-5 mb-1">
          {t("settings.offlineSubtitle")}
        </AppText>

        {list.length === 0 ? (
          <View className="items-center mt-10 px-4">
            <AppText className="text-[16px] font-semibold text-center">
              {t("settings.offlineEmpty")}
            </AppText>
          </View>
        ) : (
          list.map((pin) => {
            const title = pinTitle(pin) || t("tripDetail.fallbackTitle");
            return (
              <View
                key={pin.trip.id}
                className="flex-row items-center gap-3 rounded-2xl border px-4 py-3.5"
                style={{
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                }}
              >
                <View className="flex-1 gap-0.5">
                  <AppText className="text-[15px] font-medium" numberOfLines={1}>
                    {title}
                  </AppText>
                  <AppText tone="secondary" className="text-[12px]">
                    {formatPinSize(pinBytes(pin))}
                  </AppText>
                </View>
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    removeOne(pin);
                  }}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={t("settings.offlineRemoveA11y", { title })}
                >
                  <AppText
                    className="text-[14px] font-semibold"
                    style={{ color: theme.accent }}
                  >
                    {t("settings.offlineRemove")}
                  </AppText>
                </Pressable>
              </View>
            );
          })
        )}

        {list.length > 1 ? (
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              removeAll();
            }}
            accessibilityRole="button"
            accessibilityLabel={t("settings.offlineClearAll")}
            className="mt-1"
          >
            <AppText
              className="text-[14px] font-semibold"
              style={{ color: theme.accent }}
            >
              {t("settings.offlineClearAll")}
            </AppText>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}
