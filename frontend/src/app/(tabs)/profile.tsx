// Perfil — vibe editável + companheiros de viagem (RF03 / TCC Match).

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useColorScheme } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTabBarPadding } from "@/components/navigation/FloatingTabBar";
import { AppText } from "@/components/ui/AppText";
import { useTheme } from "@/hooks/use-theme";
import { useAuthStore } from "@/stores/authStore";
import { Pressable, ScrollView, View } from "@/tw";

// Mock de vibe até puxarmos do Firestore / auth sync.
const VIBE_CHIPS = [
  "onboarding.vibe.interests.beaches",
  "onboarding.vibe.interests.streetFood",
  "onboarding.vibe.interests.artMuseums",
  "onboarding.vibe.pace.balanced.title",
] as const;

const COMPANIONS = [
  { id: "1", name: "Marina", trips: 3 },
  { id: "2", name: "Lucas", trips: 1 },
] as const;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function ProfileScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const scheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const tabPad = useTabBarPadding();
  const user = useAuthStore((s) => s.user);

  const displayName = user?.displayName?.trim() || t("profile.fallbackName");
  const email = user?.email ?? "";

  const firstName = useMemo(
    () => displayName.split(/\s+/)[0] ?? displayName,
    [displayName],
  );

  return (
    <View className="flex-1" style={{ backgroundColor: theme.background }}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingTop: insets.top + 16,
          paddingBottom: tabPad,
          paddingHorizontal: 24,
        }}
        contentInsetAdjustmentBehavior="never"
      >
        <View className="items-center gap-3 mb-8">
          <View
            className="w-20 h-20 rounded-full overflow-hidden items-center justify-center border"
            style={{
              backgroundColor: theme.surface,
              borderColor: theme.border,
            }}
          >
            {user?.photoURL ? (
              <Image
                source={{ uri: user.photoURL }}
                style={{ width: 80, height: 80 }}
                contentFit="cover"
              />
            ) : (
              <AppText className="text-[24px] font-bold" tone="secondary">
                {initials(displayName)}
              </AppText>
            )}
          </View>
          <AppText
            className="text-[24px] font-bold"
            style={{ letterSpacing: -0.4 }}
          >
            {firstName}
          </AppText>
          {email ? (
            <AppText tone="secondary" className="text-[13px]">
              {email}
            </AppText>
          ) : null}
        </View>

        <View className="gap-3 mb-8">
          <View className="flex-row items-center justify-between">
            <AppText className="text-[18px] font-bold">
              {t("profile.vibe.title")}
            </AppText>
            <Pressable
              onPress={() =>
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
              }
              hitSlop={8}
            >
              <AppText tone="accent" className="text-[13px] font-semibold">
                {t("profile.vibe.edit")}
              </AppText>
            </Pressable>
          </View>
          <AppText tone="secondary" className="text-[13px] mb-1">
            {t("profile.vibe.hint")}
          </AppText>
          <View className="flex-row flex-wrap gap-2">
            {VIBE_CHIPS.map((key) => (
              <View
                key={key}
                className="rounded-full px-3.5 py-2 border"
                style={{
                  backgroundColor: `${theme.accent}14`,
                  borderColor: `${theme.accent}33`,
                }}
              >
                <AppText
                  className="text-[13px] font-medium"
                  style={{ color: theme.accent }}
                >
                  {t(key)}
                </AppText>
              </View>
            ))}
          </View>
        </View>

        <View className="gap-3">
          <AppText className="text-[18px] font-bold">
            {t("profile.companions.title")}
          </AppText>
          <AppText tone="secondary" className="text-[13px] mb-1">
            {t("profile.companions.hint")}
          </AppText>

          {COMPANIONS.map((c) => (
            <Pressable
              key={c.id}
              onPressIn={() =>
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
              }
              className="flex-row items-center gap-3 rounded-2xl border px-4 py-3.5"
              style={{
                backgroundColor: theme.surface,
                borderColor: theme.border,
              }}
            >
              <View
                className="w-11 h-11 rounded-full items-center justify-center"
                style={{ backgroundColor: `${theme.accent}22` }}
              >
                <AppText tone="accent" className="font-bold">
                  {initials(c.name)}
                </AppText>
              </View>
              <View className="flex-1">
                <AppText className="text-[15px] font-semibold">{c.name}</AppText>
                <AppText tone="secondary" className="text-[12px]">
                  {t("profile.companions.tripsTogether", { count: c.trips })}
                </AppText>
              </View>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={theme.textSecondary}
              />
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
