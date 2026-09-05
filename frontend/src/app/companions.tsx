// Lista completa de companheiros de viagem (API /users/me/companions).

import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Haptics from "@/lib/haptics";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Alert, useColorScheme } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText } from "@/components/ui/AppText";
import { useCompanionsList } from "@/hooks/use-companions-list";
import { useTheme } from "@/hooks/use-theme";
import { removeCompanion, type UserPublicProfile } from "@/lib/api";
import { profilePhotoUri } from "@/lib/profile";
import { Pressable, ScrollView, View } from "@/tw";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function CompanionsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const scheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const { companions, setCompanions, loading } = useCompanionsList();
  const [removingUid, setRemovingUid] = useState<string | null>(null);

  function confirmRemove(c: UserPublicProfile) {
    const name = c.name.trim() || t("profile.fallbackName");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(
      t("companions.removeTitle"),
      t("companions.removeBody", { name }),
      [
        { text: t("companions.removeCancel"), style: "cancel" },
        {
          text: t("companions.removeConfirm"),
          style: "destructive",
          onPress: () => void onRemove(c.uid),
        },
      ],
    );
  }

  async function onRemove(uid: string) {
    setRemovingUid(uid);
    try {
      await removeCompanion(uid);
      setCompanions((prev) => prev.filter((c) => c.uid !== uid));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      console.error("[companions] remove:", err);
      Alert.alert(t("companions.removeFailed"));
    } finally {
      setRemovingUid(null);
    }
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
          {t("companions.title")}
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
        <AppText tone="secondary" className="text-[13px] mb-2">
          {t("companions.subtitle")}
        </AppText>

        {loading ? (
          <View className="py-16 items-center">
            <ActivityIndicator color={theme.accent} />
          </View>
        ) : companions.length === 0 ? (
          <View
            className="rounded-2xl border px-4 py-8 items-center gap-3 mt-4"
            style={{
              backgroundColor: theme.surface,
              borderColor: theme.border,
            }}
          >
            <View
              className="w-14 h-14 rounded-full items-center justify-center"
              style={{ backgroundColor: `${theme.accent}18` }}
            >
              <Ionicons name="people-outline" size={26} color={theme.accent} />
            </View>
            <AppText className="text-[16px] font-semibold text-center">
              {t("companions.emptyTitle")}
            </AppText>
            <AppText tone="secondary" className="text-[13px] text-center px-2">
              {t("companions.emptyBody")}
            </AppText>
          </View>
        ) : (
          companions.map((c) => {
            const name = c.name.trim() || t("profile.fallbackName");
            const photo = profilePhotoUri({ photoBase64: c.photoBase64 });
            const busy = removingUid === c.uid;
            return (
              <View
                key={c.uid}
                className="flex-row items-center gap-3 rounded-2xl border px-4 py-3.5"
                style={{
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                  opacity: busy ? 0.6 : 1,
                }}
              >
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push(`/profile/${c.uid}`);
                  }}
                  className="flex-row items-center gap-3 flex-1"
                  disabled={busy}
                >
                  {photo ? (
                    <Image
                      source={{ uri: photo }}
                      style={{ width: 44, height: 44, borderRadius: 22 }}
                      contentFit="cover"
                    />
                  ) : (
                    <View
                      className="w-11 h-11 rounded-full items-center justify-center"
                      style={{ backgroundColor: `${theme.accent}22` }}
                    >
                      <AppText tone="accent" className="font-bold">
                        {initials(name)}
                      </AppText>
                    </View>
                  )}
                  <View className="flex-1">
                    <AppText className="text-[15px] font-semibold">
                      {name}
                    </AppText>
                    <AppText tone="secondary" className="text-[12px]">
                      {t("profile.companions.added")}
                    </AppText>
                  </View>
                </Pressable>
                <Pressable
                  onPress={() => confirmRemove(c)}
                  hitSlop={10}
                  disabled={busy}
                  accessibilityLabel={t("companions.removeA11y")}
                  className="w-10 h-10 rounded-full items-center justify-center"
                  style={{ backgroundColor: `${theme.error}14` }}
                >
                  {busy ? (
                    <ActivityIndicator size="small" color={theme.error} />
                  ) : (
                    <Ionicons
                      name="person-remove-outline"
                      size={18}
                      color={theme.error}
                    />
                  )}
                </Pressable>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}
