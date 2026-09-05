// Home — AI Command Center + destinos personalizados + Em Alta (RF04/RF08).

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import { Image } from "expo-image";
import { Href, router, useFocusEffect } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useColorScheme, useWindowDimensions } from "react-native";
import { ScrollView as GHScrollView } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AiCommandBar } from "@/components/home/AiCommandBar";
import { InviteBanner } from "@/components/home/InviteBanner";
import { TrendingItineraryCard } from "@/components/home/TrendingItineraryCard";
import {
  LatestTripEmpty,
  UpcomingTicket,
} from "@/components/home/UpcomingTicket";
import {
  VibeDestinationCard,
  type VibeDestination,
} from "@/components/home/VibeDestinationCard";
import { useTabBarPadding } from "@/components/navigation/FloatingTabBar";
import { AppText } from "@/components/ui/AppText";
import { TRENDING_ITINERARIES } from "@/constants/trending";
import { useTheme } from "@/hooks/use-theme";
import {
  getMyPendingMatches,
  getPlaceDetails,
  type MatchPendingSummary,
} from "@/lib/api";
import {
  getUserProfile,
  profilePhotoUri,
  type UserProfile,
} from "@/lib/profile";
import { getLatestTrip, type SavedTrip } from "@/lib/trips";
import { getRecommendedDestinations } from "@/lib/vibeDestinations";
import { useAuthStore } from "@/stores/authStore";
import { useCreateTripSheetStore } from "@/stores/createTripSheetStore";
import { Pressable, ScrollView, View } from "@/tw";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const SPRING = { damping: 20, stiffness: 300 };

function greetingKey(): "morning" | "afternoon" | "evening" {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}

function initialsFromName(name: string | null | undefined): string {
  if (!name?.trim()) return "?";
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

export default function HomeScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const scheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const tabPad = useTabBarPadding();
  const { width: screenWidth } = useWindowDimensions();
  const user = useAuthStore((s) => s.user);
  const openSheet = useCreateTripSheetStore((s) => s.open);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [latestTrip, setLatestTrip] = useState<SavedTrip | null>(null);
  const [tripPhoto, setTripPhoto] = useState<string | null>(null);
  const [tripLoading, setTripLoading] = useState(true);
  const [pendingMatch, setPendingMatch] = useState<MatchPendingSummary | null>(
    null,
  );
  const [dismissedMatchId, setDismissedMatchId] = useState<string | null>(null);

  const loadHome = useCallback(async (signal: AbortSignal) => {
    setTripLoading(true);
    try {
      const [nextProfile, trip, pending] = await Promise.all([
        getUserProfile().catch((err) => {
          console.warn("[Home] Perfil indisponível:", err);
          return null;
        }),
        getLatestTrip().catch((err) => {
          console.warn("[Home] Viagens indisponíveis:", err);
          return null;
        }),
        getMyPendingMatches(signal).catch((err) => {
          console.warn("[Home] Matches pendentes indisponíveis:", err);
          return [] as MatchPendingSummary[];
        }),
      ]);
      if (signal.aborted) return;

      setProfile(nextProfile);
      setLatestTrip(trip);

      const firstPending = pending[0] ?? null;
      setPendingMatch(firstPending);

      if (!trip?.destination?.trim()) {
        setTripPhoto(null);
        return;
      }

      try {
        const place = await getPlaceDetails(
          trip.destination.trim(),
          undefined,
          undefined,
          signal,
        );
        if (!signal.aborted) setTripPhoto(place.photo_url);
      } catch (err) {
        if (signal.aborted) return;
        console.warn("[Home] Foto do destino falhou:", err);
        setTripPhoto(null);
      }
    } finally {
      if (!signal.aborted) setTripLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      const controller = new AbortController();
      void loadHome(controller.signal);
      return () => controller.abort();
    }, [loadHome]),
  );

  const firstName = useMemo(() => {
    const fromProfile = profile?.name?.trim();
    const raw = fromProfile || user?.displayName?.trim();
    if (!raw) return null;
    return raw.split(/\s+/)[0] ?? null;
  }, [profile?.name, user?.displayName]);

  const avatarUri = useMemo(
    () => profilePhotoUri(profile, user?.photoURL),
    [profile, user?.photoURL],
  );

  const displayName = profile?.name || user?.displayName;

  const greet = t(`home.greeting.${greetingKey()}`);
  const headline = firstName
    ? t("home.greetingWithName", { greeting: greet, name: firstName })
    : greet;

  const vibeCardWidth = screenWidth * 0.72;
  const trendCardWidth = screenWidth * 0.68;
  const homeTrending = TRENDING_ITINERARIES.slice(0, 3);

  const vibeDestinations: VibeDestination[] = useMemo(
    () => getRecommendedDestinations(profile?.travel_preferences),
    [profile?.travel_preferences],
  );

  const showPending =
    pendingMatch != null && pendingMatch.id !== dismissedMatchId;

  const avatarScale = useSharedValue(1);
  const avatarStyle = useAnimatedStyle(() => ({
    transform: [{ scale: avatarScale.value }],
  }));

  function openLatestTrip() {
    if (!latestTrip) return;
    const href = {
      pathname: "/trip-detail",
      params: { tripId: latestTrip.id },
    } as unknown as Href;
    router.push(href);
  }

  function openPendingLobby() {
    if (!pendingMatch) return;
    router.push(`/match/${pendingMatch.id}` as Href);
  }

  const Header = (
    <View
      className="flex-row items-center justify-between px-6 pb-4"
      style={{
        paddingTop: insets.top + 8,
        backgroundColor: theme.background,
      }}
    >
      <AppText
        className="flex-1 pr-3 font-bold"
        style={{
          fontSize: 28,
          lineHeight: 34,
          letterSpacing: -0.6,
          color: theme.textPrimary,
        }}
        numberOfLines={2}
      >
        {headline}
      </AppText>

      <AnimatedPressable
        accessibilityLabel={t("home.avatarA11y")}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push("/(tabs)/profile" as Href);
        }}
        onPressIn={() => {
          avatarScale.value = withSpring(0.92, SPRING);
        }}
        onPressOut={() => {
          avatarScale.value = withSpring(1, SPRING);
        }}
        style={[
          avatarStyle,
          {
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: theme.surface,
            borderWidth: 1,
            borderColor: theme.border,
            overflow: "hidden",
            alignItems: "center",
            justifyContent: "center",
          },
        ]}
      >
        {avatarUri ? (
          <Image
            source={{ uri: avatarUri }}
            style={{ width: 44, height: 44 }}
            contentFit="cover"
          />
        ) : (
          <AppText className="text-[15px] font-bold" tone="secondary">
            {initialsFromName(displayName)}
          </AppText>
        )}
      </AnimatedPressable>
    </View>
  );

  return (
    <View className="flex-1" style={{ backgroundColor: theme.background }}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[0]}
        contentContainerStyle={{ paddingBottom: tabPad }}
        contentInsetAdjustmentBehavior="never"
      >
        {Header}

        <View className="gap-6 pt-2">
          <View className="px-6 gap-4">
            {tripLoading ? (
              <UpcomingTicket
                destination=""
                days={0}
                image={null}
                loading
              />
            ) : latestTrip ? (
              <UpcomingTicket
                destination={
                  latestTrip.title?.trim() || latestTrip.destination
                }
                days={latestTrip.days?.length ?? 0}
                image={tripPhoto}
                onPress={openLatestTrip}
              />
            ) : (
              <LatestTripEmpty onPress={openSheet} />
            )}

            <AiCommandBar />

            {showPending && pendingMatch ? (
              <InviteBanner
                destination={pendingMatch.destination}
                onAccept={openPendingLobby}
                onDismiss={() => setDismissedMatchId(pendingMatch.id)}
              />
            ) : null}
          </View>

          <View className="gap-3">
            <AppText className="text-[18px] font-bold px-6">
              {t("home.vibe.title")}
            </AppText>
            <GHScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              // Scroll livre — sem snap. GHScrollView não disputa gesto com o pai.
              decelerationRate="normal"
              bounces
              overScrollMode="never"
              contentContainerStyle={{ paddingHorizontal: 24 }}
            >
              {vibeDestinations.map((dest) => (
                <VibeDestinationCard
                  key={dest.id}
                  dest={dest}
                  width={vibeCardWidth}
                />
              ))}
            </GHScrollView>
          </View>

          <View className="gap-3">
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/trending");
              }}
              className="flex-row items-center px-6 gap-1"
              accessibilityRole="button"
            >
              <AppText className="text-[18px] font-bold flex-1">
                {t("home.trending.title")}
              </AppText>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={theme.textSecondary}
              />
            </Pressable>
            <GHScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              decelerationRate="normal"
              bounces
              overScrollMode="never"
              contentContainerStyle={{ paddingHorizontal: 24 }}
            >
              {homeTrending.map((item) => (
                <TrendingItineraryCard
                  key={item.id}
                  item={item}
                  width={trendCardWidth}
                />
              ))}
            </GHScrollView>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
