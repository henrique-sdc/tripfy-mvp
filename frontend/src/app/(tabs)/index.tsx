// Home — AI Command Center + destinos personalizados + Em Alta (RF04/RF08).

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useColorScheme, useWindowDimensions } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AiCommandBar } from "@/components/home/AiCommandBar";
import { InviteBanner } from "@/components/home/InviteBanner";
import { TrendingItineraryCard } from "@/components/home/TrendingItineraryCard";
import { UpcomingTicket } from "@/components/home/UpcomingTicket";
import {
  VibeDestinationCard,
  type VibeDestination,
} from "@/components/home/VibeDestinationCard";
import { useTabBarPadding } from "@/components/navigation/FloatingTabBar";
import { AppText } from "@/components/ui/AppText";
import { TRENDING_ITINERARIES } from "@/constants/trending";
import { useTheme } from "@/hooks/use-theme";
import { useAuthStore } from "@/stores/authStore";
import { Pressable, ScrollView, View } from "@/tw";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const SPRING = { damping: 20, stiffness: 300 };

const NEAR_TRIP = {
  destinationKey: "home.trips.cancun.destination",
  daysLeft: 5,
  image:
    "https://images.unsplash.com/photo-1519046904884-53103b34b206?q=80&w=1200&auto=format&fit=crop",
} as const;

const VIBE_DESTINATIONS: VibeDestination[] = [
  {
    id: "dest-bali",
    image:
      "https://images.unsplash.com/photo-1537996194471-e657df975ab4?q=80&w=1000&auto=format&fit=crop",
    nameKey: "home.destinations.bali",
    vibeKey: "home.vibe.match.bali",
  },
  {
    id: "dest-lisbon",
    image:
      "https://images.unsplash.com/photo-1588535684923-900727736ac0?q=80&w=1000&auto=format&fit=crop",
    nameKey: "home.destinations.lisbon",
    vibeKey: "home.vibe.match.lisbon",
  },
  {
    id: "dest-tokyo",
    image:
      "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?q=80&w=1000&auto=format&fit=crop",
    nameKey: "home.destinations.tokyo",
    vibeKey: "home.vibe.match.tokyo",
  },
  {
    id: "dest-rio",
    image:
      "https://images.unsplash.com/photo-1483729558449-99ef09a8c325?q=80&w=1000&auto=format&fit=crop",
    nameKey: "home.destinations.rio",
    vibeKey: "home.vibe.match.rio",
  },
];

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
  const [showInvite, setShowInvite] = useState(true);

  const firstName = useMemo(() => {
    const raw = user?.displayName?.trim();
    if (!raw) return null;
    return raw.split(/\s+/)[0] ?? null;
  }, [user?.displayName]);

  const greet = t(`home.greeting.${greetingKey()}`);
  const headline = firstName
    ? t("home.greetingWithName", { greeting: greet, name: firstName })
    : greet;

  const vibeCardWidth = screenWidth * 0.72;
  const trendCardWidth = screenWidth * 0.68;
  const showTicket = NEAR_TRIP.daysLeft <= 7;
  // Home mostra só os 3 primeiros; o resto na tela Em Alta.
  const homeTrending = TRENDING_ITINERARIES.slice(0, 3);

  const avatarScale = useSharedValue(1);
  const avatarStyle = useAnimatedStyle(() => ({
    transform: [{ scale: avatarScale.value }],
  }));

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
        onPressIn={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
        {user?.photoURL ? (
          <Image
            source={{ uri: user.photoURL }}
            style={{ width: 44, height: 44 }}
            contentFit="cover"
          />
        ) : (
          <AppText className="text-[15px] font-bold" tone="secondary">
            {initialsFromName(user?.displayName)}
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
            {showTicket && (
              <UpcomingTicket
                destination={t(NEAR_TRIP.destinationKey)}
                daysLeft={NEAR_TRIP.daysLeft}
                image={NEAR_TRIP.image}
              />
            )}

            <AiCommandBar />

            {showInvite && (
              <InviteBanner
                inviterName={t("home.invite.mockName")}
                destination={t("home.invite.mockDestination")}
                onDismiss={() => setShowInvite(false)}
              />
            )}
          </View>

          <View className="gap-3">
            <AppText className="text-[18px] font-bold px-6">
              {t("home.vibe.title")}
            </AppText>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              decelerationRate="fast"
              snapToInterval={vibeCardWidth + 12}
              snapToAlignment="start"
              disableIntervalMomentum
              contentContainerStyle={{ paddingHorizontal: 24 }}
            >
              {VIBE_DESTINATIONS.map((dest) => (
                <VibeDestinationCard
                  key={dest.id}
                  dest={dest}
                  width={vibeCardWidth}
                />
              ))}
            </ScrollView>
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
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              decelerationRate="fast"
              snapToInterval={trendCardWidth + 12}
              snapToAlignment="start"
              disableIntervalMomentum
              contentContainerStyle={{ paddingHorizontal: 24 }}
            >
              {homeTrending.map((item) => (
                <TrendingItineraryCard
                  key={item.id}
                  item={item}
                  width={trendCardWidth}
                />
              ))}
            </ScrollView>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
