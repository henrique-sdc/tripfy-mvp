// Trip Detail — visualiza o roteiro gerado pela IA (RF06 / RF07 base).
// Recebe o JSON via params da rota (vindo do Wizard Solo após o SSE).

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  ScrollView as RNScrollView,
  StyleSheet,
  useColorScheme,
  View as RNView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText } from "@/components/ui/AppText";
import type { ItineraryResponse } from "@/lib/api";
import { useTheme } from "@/hooks/use-theme";
import { Pressable } from "@/tw";

function parseItinerary(raw: string | string[] | undefined): ItineraryResponse | null {
  if (!raw) return null;
  const value = Array.isArray(raw) ? raw[0] : raw;
  try {
    const parsed = JSON.parse(value) as ItineraryResponse;
    if (!parsed?.destination || !Array.isArray(parsed.days)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export default function TripDetailScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const scheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const { itinerary: itineraryParam } = useLocalSearchParams<{
    itinerary?: string;
  }>();

  const itinerary = useMemo(
    () => parseItinerary(itineraryParam),
    [itineraryParam],
  );

  return (
    <RNView style={[styles.root, { backgroundColor: theme.background }]}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />

      <RNView
        style={[
          styles.header,
          {
            paddingTop: insets.top + 8,
            borderBottomColor: theme.border,
            backgroundColor: theme.background,
          },
        ]}
      >
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.replace("/(tabs)");
          }}
          hitSlop={12}
          style={[styles.closeBtn, { backgroundColor: theme.surface }]}
          accessibilityLabel={t("tripDetail.close")}
        >
          <Ionicons name="close" size={22} color={theme.textPrimary} />
        </Pressable>
        <RNView style={styles.headerCopy}>
          <AppText
            className="text-[18px] font-bold"
            style={{ letterSpacing: -0.3 }}
            numberOfLines={1}
          >
            {itinerary?.destination ?? t("tripDetail.fallbackTitle")}
          </AppText>
          <AppText tone="secondary" className="text-[12px]">
            {itinerary
              ? t("tripDetail.daysCount", { count: itinerary.days.length })
              : t("tripDetail.subtitle")}
          </AppText>
        </RNView>
      </RNView>

      {!itinerary ? (
        <RNView style={styles.empty}>
          <AppText className="text-center text-[16px] font-semibold">
            {t("tripDetail.emptyTitle")}
          </AppText>
          <AppText tone="secondary" className="text-center text-[13px]">
            {t("tripDetail.emptyBody")}
          </AppText>
        </RNView>
      ) : (
        <RNScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + 32 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <AppText tone="secondary" className="text-[14px] leading-5">
            {itinerary.summary}
          </AppText>

          {itinerary.days.map((day) => (
            <RNView key={day.day} style={styles.dayBlock}>
              <AppText className="text-[15px] font-bold">
                {t("tripDetail.dayLabel", {
                  day: day.day,
                  title: day.title,
                })}
              </AppText>

              {day.activities.map((activity, idx) => (
                <RNView
                  key={`${day.day}-${idx}-${activity.time}`}
                  style={[
                    styles.activityCard,
                    {
                      backgroundColor: theme.surface,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <AppText tone="accent" className="text-[12px] font-semibold">
                    {activity.time}
                  </AppText>
                  <AppText className="text-[15px] font-semibold">
                    {activity.title}
                  </AppText>
                  <AppText tone="secondary" className="text-[13px] leading-5">
                    {activity.description}
                  </AppText>
                  <RNView style={styles.locationRow}>
                    <Ionicons
                      name="location-outline"
                      size={14}
                      color={theme.textMuted}
                    />
                    <AppText tone="muted" className="text-[12px]">
                      {activity.location}
                    </AppText>
                  </RNView>
                </RNView>
              ))}
            </RNView>
          ))}
        </RNScrollView>
      )}
    </RNView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCopy: { flex: 1 },
  content: {
    paddingHorizontal: 24,
    paddingTop: 20,
    gap: 24,
  },
  dayBlock: { gap: 12 },
  activityCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 6,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 8,
  },
});
