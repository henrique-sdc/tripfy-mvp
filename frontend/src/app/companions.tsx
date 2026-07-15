// Lista completa de companheiros de viagem.
// RF11 (Match) vai popular isso; por enquanto empty state honesto.

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useColorScheme } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText } from "@/components/ui/AppText";
import { useTheme } from "@/hooks/use-theme";
import { Pressable, ScrollView, View } from "@/tw";

type Companion = { id: string; name: string; trips: number };

// Mesma fonte do preview no perfil — hoje vazia até o Match existir.
const COMPANIONS: Companion[] = [];

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

  const companions = useMemo(
    () => [...COMPANIONS].sort((a, b) => b.trips - a.trips),
    [],
  );

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

        {companions.length === 0 ? (
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
          companions.map((c) => (
            <View
              key={c.id}
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
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}
