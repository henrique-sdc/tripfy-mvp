// Lista completa "Em Alta" — busca + categorias + CTA wizard (RF08).

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FlatList,
  TextInput,
  useColorScheme,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TrendingItineraryCard } from "@/components/home/TrendingItineraryCard";
import { AppText } from "@/components/ui/AppText";
import {
  TRENDING_CATEGORIES,
  TRENDING_ITINERARIES,
  type TrendingCategoryId,
  filterTrendingItineraries,
} from "@/constants/trending";
import { useTheme } from "@/hooks/use-theme";
import { Pressable, ScrollView, View } from "@/tw";

export default function TrendingScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const scheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<TrendingCategoryId>("all");

  const filtered = useMemo(
    () =>
      filterTrendingItineraries(TRENDING_ITINERARIES, {
        category,
        query,
        resolveTitle: (item) => t(item.titleKey),
      }),
    [category, query, t],
  );

  const listWidth = width - 48;
  const hasFilters = query.trim().length > 0 || category !== "all";

  function clearFilters() {
    Haptics.selectionAsync();
    setQuery("");
    setCategory("all");
  }

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
            clearButtonMode="never"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {query.length > 0 ? (
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

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingRight: 4 }}
        >
          {TRENDING_CATEGORIES.map((chip) => {
            const active = category === chip.id;
            return (
              <Pressable
                key={chip.id}
                onPress={() => {
                  Haptics.selectionAsync();
                  setCategory(chip.id);
                }}
                className="h-8 px-3.5 rounded-full border items-center justify-center"
                style={{
                  backgroundColor: active ? theme.accent : theme.surface,
                  borderColor: active ? theme.accent : theme.border,
                }}
              >
                <AppText
                  className="text-[13px] font-semibold"
                  style={{
                    color: active ? "#FFFFFF" : theme.textSecondary,
                  }}
                >
                  {t(chip.labelKey)}
                </AppText>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

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
        ListHeaderComponent={
          <AppText tone="secondary" className="text-[14px] mb-1">
            {t("trending.screenSubtitle")}
          </AppText>
        }
        ListEmptyComponent={
          <View className="items-center gap-3 mt-16 px-4">
            <Ionicons
              name="search-outline"
              size={36}
              color={theme.textMuted}
            />
            <AppText className="text-[16px] font-semibold text-center">
              {t("trending.emptyTitle")}
            </AppText>
            <AppText tone="secondary" className="text-[13px] text-center">
              {t("trending.emptyBody")}
            </AppText>
            {hasFilters ? (
              <Pressable
                onPress={clearFilters}
                className="mt-2 h-11 px-5 rounded-full items-center justify-center"
                style={{ backgroundColor: theme.buttonPrimary }}
              >
                <AppText
                  className="text-[13px] font-bold"
                  style={{ color: theme.buttonText }}
                >
                  {t("trending.clearFilters")}
                </AppText>
              </Pressable>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <TrendingItineraryCard
            item={item}
            variant="list"
            width={listWidth}
          />
        )}
      />
    </View>
  );
}
