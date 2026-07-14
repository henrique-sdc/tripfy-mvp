// Ticket de viagem próxima (≤7 dias) — só aparece quando importa.

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { AppText } from "@/components/ui/AppText";
import { Pressable, View } from "@/tw";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const SPRING = { damping: 20, stiffness: 300 };

type UpcomingTicketProps = {
  destination: string;
  daysLeft: number;
  image: string;
  onPress?: () => void;
};

export function UpcomingTicket({
  destination,
  daysLeft,
  image,
  onPress,
}: UpcomingTicketProps) {
  const { t } = useTranslation();
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
      }}
      onPressIn={() => {
        scale.value = withSpring(0.97, SPRING);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, SPRING);
      }}
      style={style}
      className="rounded-2xl overflow-hidden h-[88px]"
    >
      <Image
        source={{ uri: image }}
        style={{ position: "absolute", width: "100%", height: "100%" }}
        contentFit="cover"
      />
      <LinearGradient
        colors={["rgba(0,0,0,0.15)", "rgba(0,0,0,0.75)"]}
        style={{ position: "absolute", width: "100%", height: "100%" }}
      />
      <View className="flex-1 flex-row items-center justify-between px-4">
        <View className="flex-1 pr-3 gap-1">
          <AppText
            className="text-[11px] font-semibold uppercase tracking-widest"
            style={{ color: "rgba(255,255,255,0.75)" }}
          >
            {t("home.ticket.badge", { count: daysLeft })}
          </AppText>
          <AppText className="text-[16px] font-bold" style={{ color: "#fff" }}>
            {t("home.ticket.message", { destination })}
          </AppText>
        </View>
        <View className="flex-row items-center gap-1">
          <AppText className="text-[13px] font-semibold" style={{ color: "#fff" }}>
            {t("home.ticket.cta")}
          </AppText>
          <Ionicons name="chevron-forward" size={16} color="#fff" />
        </View>
      </View>
    </AnimatedPressable>
  );
}
