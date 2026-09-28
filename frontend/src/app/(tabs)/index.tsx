// Home — saudação, convite de Match, último roteiro e destinos (RF04/RF08).

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import { Image } from "expo-image";
import { Href, router, useFocusEffect } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  RefreshControl,
  useColorScheme,
  useWindowDimensions,
} from "react-native";
import { ScrollView as GHScrollView } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
  declineMatchInvite,
  getMyMatchInvites,
  getPlaceDetails,
  joinMatch,
  type MatchIncomingInvite,
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
// ponytail: poll enquanto a Home está aberta. O convidado não lê `matches`
// no client (rules). Upgrade: doc de convite que o usuário pode ouvir.
const INVITE_POLL_MS = 5000;

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
  const [invite, setInvite] = useState<MatchIncomingInvite | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const muteInviteId = useRef<string | null>(null);

  const loadHome = useCallback(async (signal: AbortSignal, quiet = false) => {
    if (!quiet) setTripLoading(true);
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
        getMyMatchInvites(signal).catch((err) => {
          console.warn("[Home] Convites de Match indisponíveis:", err);
          return [] as MatchIncomingInvite[];
        }),
      ]);
      if (signal.aborted) return;

      setProfile(nextProfile);
      setLatestTrip(trip);

      const muted = muteInviteId.current;
      setInvite(pending.find((item) => item.id !== muted) ?? null);

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
      if (!signal.aborted && !quiet) setTripLoading(false);
    }
  }, []);

  const refreshInvites = useCallback(async () => {
    try {
      const pending = await getMyMatchInvites();
      const muted = muteInviteId.current;
      setInvite(pending.find((item) => item.id !== muted) ?? null);
    } catch (err) {
      console.warn("[Home] Convites de Match indisponíveis:", err);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      const controller = new AbortController();
      void loadHome(controller.signal);
      const timer = setInterval(() => {
        void refreshInvites();
      }, INVITE_POLL_MS);
      return () => {
        controller.abort();
        clearInterval(timer);
      };
    }, [loadHome, refreshInvites]),
  );

  async function onRefresh() {
    setRefreshing(true);
    try {
      await loadHome(new AbortController().signal, true);
    } finally {
      setRefreshing(false);
    }
  }

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

  const showInvite = invite != null;

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

  async function acceptInvite() {
    if (!invite || accepting) return;
    setAccepting(true);
    try {
      await joinMatch(invite.id);
      router.push(`/match/${invite.id}` as Href);
    } catch (err) {
      console.error("[Home] Aceitar convite falhou:", err);
      Alert.alert(t("home.invite.failTitle"), t("home.invite.failBody"));
    } finally {
      setAccepting(false);
    }
  }

  async function declineInvite() {
    if (!invite || accepting) return;
    const current = invite;
    muteInviteId.current = current.id;
    setInvite(null);
    try {
      await declineMatchInvite(current.id);
      muteInviteId.current = null;
    } catch (err) {
      console.error("[Home] Recusar convite falhou:", err);
      muteInviteId.current = null;
      setInvite(current);
      Alert.alert(t("home.invite.failTitle"), t("home.invite.declineFail"));
    }
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
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={theme.accent}
            colors={[theme.accent]}
          />
        }
      >
        {Header}

        <View className="gap-6 pt-2">
          {showInvite && invite ? (
            <View className="px-6">
              <InviteBanner
                name={invite.owner_name}
                destination={invite.destination}
                photoUri={profilePhotoUri({ photoBase64: invite.owner_photo })}
                accepting={accepting}
                onAccept={() => void acceptInvite()}
                onDecline={() => void declineInvite()}
              />
            </View>
          ) : null}

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
                days={latestTrip.days?.length || latestTrip.day_count || 0}
                image={tripPhoto}
                onPress={openLatestTrip}
              />
            ) : (
              <LatestTripEmpty onPress={openSheet} />
            )}
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

          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/explore" as Href);
            }}
            className="mx-6 rounded-2xl px-4 py-3 flex-row items-center gap-3"
            style={{ backgroundColor: theme.surface }}
            accessibilityRole="button"
          >
            <Ionicons name="compass-outline" size={20} color={theme.accent} />
            <View className="flex-1">
              <AppText className="text-[16px] font-semibold">
                {t("home.explore.title")}
              </AppText>
              <AppText tone="secondary" className="text-[13px]">
                {t("home.explore.hint")}
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
          </Pressable>

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
