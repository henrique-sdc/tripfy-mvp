// Viagens — gestão de roteiros gerados (RF04). Pílulas: Próximas | Rascunhos | Passadas.

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useColorScheme } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTabBarPadding } from "@/components/navigation/FloatingTabBar";
import { AppText } from "@/components/ui/AppText";
import { useTheme } from "@/hooks/use-theme";
import { Pressable, ScrollView, View } from "@/tw";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const SPRING = { damping: 20, stiffness: 300 };

type TripFilter = "upcoming" | "drafts" | "past";

const MOCK_TRIPS: Record<
  TripFilter,
  { id: string; image: string; titleKey: string; datesKey: string }[]
> = {
  upcoming: [
    {
      id: "cancun",
      image:
        "https://images.unsplash.com/photo-1519046904884-53103b34b206?q=80&w=1000&auto=format&fit=crop",
      titleKey: "home.trips.cancun.destination",
      datesKey: "home.trips.cancun.dates",
    },
    {
      id: "lisbon",
      image:
        "https://images.unsplash.com/photo-1588535684923-900727736ac0?q=80&w=1000&auto=format&fit=crop",
      titleKey: "home.trips.lisbon.destination",
      datesKey: "home.trips.lisbon.dates",
    },
  ],
  drafts: [
    {
      id: "tokyo",
      image:
        "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?q=80&w=1000&auto=format&fit=crop",
      titleKey: "home.trips.tokyo.destination",
      datesKey: "trips.draftLabel",
    },
  ],
  past: [],
};

function Pill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      onPressIn={() => {
        scale.value = withSpring(0.95, SPRING);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, SPRING);
      }}
      style={[
        style,
        {
          backgroundColor: active ? theme.accent : theme.surface,
          borderColor: active ? theme.accent : theme.border,
        },
      ]}
      className="rounded-full px-4 py-2 border"
    >
      <AppText
        className="text-[13px] font-semibold"
        style={{ color: active ? "#fff" : theme.textSecondary }}
      >
        {label}
      </AppText>
    </AnimatedPressable>
  );
}

export default function TripsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const scheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const tabPad = useTabBarPadding();
  const [filter, setFilter] = useState<TripFilter>("upcoming");
  const list = MOCK_TRIPS[filter];

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
        <AppText
          className="font-bold mb-1"
          style={{ fontSize: 28, letterSpacing: -0.5 }}
        >
          {t("trips.title")}
        </AppText>
        <AppText tone="secondary" className="text-[14px] mb-5">
          {t("trips.subtitle")}
        </AppText>

        <View className="flex-row gap-2 mb-6">
          <Pill
            label={t("trips.filters.upcoming")}
            active={filter === "upcoming"}
            onPress={() => setFilter("upcoming")}
          />
          <Pill
            label={t("trips.filters.drafts")}
            active={filter === "drafts"}
            onPress={() => setFilter("drafts")}
          />
          <Pill
            label={t("trips.filters.past")}
            active={filter === "past"}
            onPress={() => setFilter("past")}
          />
        </View>

        {list.length === 0 ? (
          <View
            className="items-center rounded-3xl border border-dashed py-14 px-6 gap-3"
            style={{ borderColor: theme.border }}
          >
            <Ionicons name="map-outline" size={36} color={theme.textMuted} />
            <AppText className="text-[15px] font-semibold text-center">
              {t(`trips.empty.${filter}`)}
            </AppText>
          </View>
        ) : (
          <View className="gap-4">
            {list.map((trip) => (
              <Pressable
                key={trip.id}
                onPressIn={() =>
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                }
                className="rounded-3xl overflow-hidden h-[160px]"
              >
                <Image
                  source={{ uri: trip.image }}
                  style={{ width: "100%", height: "100%" }}
                  contentFit="cover"
                />
                <LinearGradient
                  colors={["transparent", "rgba(0,0,0,0.75)"]}
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: 0,
                    top: 0,
                  }}
                />
                <View className="absolute left-0 right-0 bottom-0 p-4 gap-1">
                  <AppText
                    className="text-[18px] font-bold"
                    style={{ color: "#fff" }}
                  >
                    {t(trip.titleKey)}
                  </AppText>
                  <AppText
                    className="text-[13px]"
                    style={{ color: "rgba(255,255,255,0.8)" }}
                  >
                    {t(trip.datesKey)}
                  </AppText>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
