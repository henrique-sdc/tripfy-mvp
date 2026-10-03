// Em alta — top 10 roteiros públicos salvos nesta semana.

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  FlatList,
  TextInput,
  useColorScheme,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TrendingItineraryCard } from "@/components/home/TrendingItineraryCard";
import { AppText } from "@/components/ui/AppText";
import { useTheme } from "@/hooks/use-theme";
import { listWeeklyTop, type ExploreCard } from "@/lib/explore";
import { Pressable, View } from "@/tw";

function TrendingHeader() {
  const { t } = useTranslation();
  return (
    <AppText tone="secondary" className="text-[14px] mb-1">
      {t("trending.screenSubtitle")}
    </AppText>
  );
}

function TrendingEmpty({ searching }: { searching: boolean }) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <View className="items-center gap-3 mt-16 px-4">
      <Ionicons name="heart-outline" size={36} color={theme.textMuted} />
      <AppText className="text-[16px] font-semibold text-center">
        {t("trending.emptyTitle")}
      </AppText>
      <AppText tone="secondary" className="text-[13px] text-center">
        {searching ? t("trending.emptyBody") : t("home.trending.empty")}
      </AppText>
    </View>
  );
}

export default function TrendingScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const scheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const [query, setQuery] = useState("");
  const [trips, setTrips] = useState<ExploreCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void listWeeklyTop()
      .then((cards) => {
        if (!cancelled) setTrips(cards);
      })
      .catch((err: unknown) => {
        console.warn("[trending] lista:", err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return trips;
    return trips.filter((item) =>
      `${item.destination} ${item.title}`.toLowerCase().includes(needle),
    );
  }, [query, trips]);

  const listWidth = width - 48;
  const searching = query.trim().length > 0;

  return (
    <View className="flex-1" style={{ backgroundColor: theme.background }}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />

      <View
        className="px-4 pb-3 gap-3"
        style={{
          paddingTop: insets.top + 8,
          borderBottomWidth: 1,
          borderBottomColor: theme.border,
          backgroundColor: theme.background,
        }}
      >
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            hitSlop={12}
            className="w-10 h-10 rounded-full items-center justify-center"
            style={{ backgroundColor: theme.surface }}
            accessibilityLabel={t("wizard.close")}
          >
            <Ionicons name="chevron-back" size={22} color={theme.textPrimary} />
          </Pressable>
          <AppText className="text-[18px] font-bold flex-1">
            {t("trending.screenTitle")}
          </AppText>
        </View>

        <View
          className="flex-row items-center gap-2 rounded-2xl border px-3"
          style={{
            backgroundColor: theme.surface,
            borderColor: theme.border,
            height: 44,
          }}
        >
          <Ionicons name="search" size={18} color={theme.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t("trending.searchPlaceholder")}
            placeholderTextColor={theme.textMuted}
            style={{
              flex: 1,
              fontSize: 15,
              color: theme.textPrimary,
              paddingVertical: 0,
            }}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {searching ? (
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                setQuery("");
              }}
              hitSlop={8}
              accessibilityLabel={t("trending.clearSearchA11y")}
            >
              <Ionicons name="close-circle" size={18} color={theme.textMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={theme.accent} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            padding: 24,
            paddingBottom: insets.bottom + 32,
            gap: 16,
            flexGrow: 1,
          }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={<TrendingHeader />}
          ListEmptyComponent={<TrendingEmpty searching={searching} />}
          renderItem={({ item }) => (
            <TrendingItineraryCard
              trip={item}
              variant="list"
              width={listWidth}
            />
          )}
        />
      )}
    </View>
  );
}
