// Explorar (RF08) — cartões públicos. A barra de abas continua com 4 rotas.

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import { Image } from "expo-image";
import { router, type Href } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  FlatList,
  TextInput,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { QueryDocumentSnapshot } from "firebase/firestore";

import { AppText } from "@/components/ui/AppText";
import { useTheme } from "@/hooks/use-theme";
import { getPlaceDetails } from "@/lib/api";
import {
  destinationKey,
  listExploreTrips,
  type ExploreCard,
  type ExploreSort,
} from "@/lib/explore";
import { Pressable, View } from "@/tw";

function ExploreEmpty({ message }: { message: string }) {
  return (
    <AppText tone="secondary" className="text-[15px] px-2 pt-8">
      {message}
    </AppText>
  );
}

function ExploreCardRow({
  item,
  onPress,
}: {
  item: ExploreCard;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const title = item.title.trim() || item.destination;
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    const query = item.destination.trim();
    if (query.length < 2) {
      setPhotoUrl(null);
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    void getPlaceDetails(query, undefined, undefined, controller.signal)
      .then((place) => {
        if (!cancelled) setPhotoUrl(place.photo_url);
      })
      .catch((err: unknown) => {
        if (cancelled || controller.signal.aborted) return;
        console.warn("[explore] foto:", err);
        setPhotoUrl(null);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [item.destination]);

  return (
    <Pressable
      onPress={onPress}
      className="flex-row rounded-2xl overflow-hidden mb-3"
      style={{ backgroundColor: theme.surface, minHeight: 96 }}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View style={{ width: 104, minHeight: 96, backgroundColor: theme.border }}>
        {photoUrl ? (
          <Image
            source={{ uri: photoUrl }}
            style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
            contentFit="cover"
          />
        ) : (
          <View className="flex-1 items-center justify-center">
            <Ionicons name="image-outline" size={22} color={theme.textMuted} />
          </View>
        )}
      </View>
      <View className="flex-1 px-3 py-3 justify-center">
        <AppText className="text-[16px] font-semibold" numberOfLines={2}>
          {title}
        </AppText>
        <AppText tone="secondary" className="text-[13px] mt-1">
          {t("explore.meta", {
            destination: item.destination,
            count: item.dayCount,
            name: item.ownerName || t("tripDetail.presence.someone"),
          })}
        </AppText>
        {item.summary ? (
          <AppText tone="secondary" className="text-[13px] mt-1" numberOfLines={2}>
            {item.summary}
          </AppText>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function ExploreScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const scheme = useColorScheme();
  const insets = useSafeAreaInsets();

  const [sort, setSort] = useState<ExploreSort>("recent");
  const [draft, setDraft] = useState("");
  const [activeKey, setActiveKey] = useState("");
  const [cards, setCards] = useState<ExploreCard[]>([]);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(
    async (mode: "replace" | "more") => {
      if (mode === "more" && !cursor) return;
      if (mode === "replace") setLoading(true);
      else setLoadingMore(true);
      setError(false);
      try {
        const page = await listExploreTrips({
          sort,
          destinationKey: activeKey || undefined,
          cursor: mode === "more" ? cursor : null,
        });
        setCards((prev) =>
          mode === "more" ? [...prev, ...page.cards] : page.cards,
        );
        setCursor(page.cursor);
      } catch (err) {
        console.warn("[explore] lista:", err);
        if (mode === "replace") setError(true);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [activeKey, cursor, sort],
  );

  useEffect(() => {
    setCursor(null);
    setCards([]);
    let cancelled = false;
    setLoading(true);
    setError(false);
    void listExploreTrips({
      sort,
      destinationKey: activeKey || undefined,
    })
      .then((page) => {
        if (cancelled) return;
        setCards(page.cards);
        setCursor(page.cursor);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.warn("[explore] lista:", err);
        setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sort, activeKey]);

  function beginQuery(nextSort: ExploreSort, nextKey: string) {
    if (nextSort === sort && nextKey === activeKey) return;
    setLoading(true);
    setCursor(null);
    setCards([]);
    setSort(nextSort);
    setActiveKey(nextKey);
  }

  function submitSearch() {
    Haptics.selectionAsync();
    beginQuery(sort, destinationKey(draft));
  }

  function pickSort(next: ExploreSort) {
    Haptics.selectionAsync();
    setDraft("");
    beginQuery(next, "");
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
            {t("explore.title")}
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
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={submitSearch}
            placeholder={t("explore.searchPlaceholder")}
            placeholderTextColor={theme.textMuted}
            style={{
              flex: 1,
              fontSize: 15,
              color: theme.textPrimary,
              paddingVertical: 0,
            }}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="words"
          />
        </View>

        <View className="flex-row gap-2">
          {(["recent", "popular"] as const).map((item) => {
            const selected = activeKey ? item === "recent" : sort === item;
            return (
              <Pressable
                key={item}
                onPress={() => pickSort(item)}
                className="px-3 py-1.5 rounded-full"
                style={{
                  backgroundColor: selected ? theme.buttonPrimary : theme.surface,
                }}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <AppText
                  className="text-[13px] font-semibold"
                  style={{ color: selected ? theme.buttonText : theme.textPrimary }}
                >
                  {t(`explore.sort.${item}`)}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={theme.accent} />
        </View>
      ) : (
        <FlatList
          data={cards}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            padding: 16,
            paddingBottom: insets.bottom + 24,
            flexGrow: 1,
          }}
          onEndReached={() => {
            if (!cursor || loadingMore || loading) return;
            void load("more");
          }}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            <ExploreEmpty message={error ? t("explore.error") : t("explore.empty")} />
          }
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator color={theme.accent} style={{ marginTop: 12 }} />
            ) : null
          }
          renderItem={({ item }) => (
            <ExploreCardRow
              item={item}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push(`/trip/${item.id}` as Href);
              }}
            />
          )}
        />
      )}
    </View>
  );
}
