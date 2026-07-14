// Card de destino personalizado — coração salva na wishlist; tap sugere IA.

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Alert } from "react-native";
import { useTranslation } from "react-i18next";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { AppText } from "@/components/ui/AppText";
import { useCreateTripSheetStore } from "@/stores/createTripSheetStore";
import { useWishlistStore } from "@/stores/wishlistStore";
import { Pressable, View } from "@/tw";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const SPRING = { damping: 20, stiffness: 300 };

export type VibeDestination = {
  id: string;
  image: string;
  nameKey: string;
  vibeKey: string;
};

type Props = {
  dest: VibeDestination;
  width: number;
};

export function VibeDestinationCard({ dest, width }: Props) {
  const { t } = useTranslation();
  const openSheet = useCreateTripSheetStore((s) => s.open);
  const saved = useWishlistStore((s) => s.has(dest.id));
  const toggle = useWishlistStore((s) => s.toggle);
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const name = t(dest.nameKey);
  const height = width * 0.62;

  function onFavorite() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    toggle({
      id: dest.id,
      kind: "destination",
      title: name,
      image: dest.image,
      subtitle: t(dest.vibeKey),
    });
  }

  function onCardPress() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(
      t("home.vibe.promptTitle"),
      t("home.vibe.promptBody", { city: name }),
      [
        { text: t("home.vibe.promptCancel"), style: "cancel" },
        {
          text: t("home.vibe.promptConfirm"),
          onPress: () => openSheet(),
        },
      ],
    );
  }

  return (
    <AnimatedPressable
      onPress={onCardPress}
      onPressIn={() => {
        scale.value = withSpring(0.97, SPRING);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, SPRING);
      }}
      style={[style, { width }]}
      className="rounded-3xl overflow-hidden mr-3"
    >
      <View style={{ width, height }}>
        <Image
          source={{ uri: dest.image }}
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
          transition={200}
        />
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.55)", "#000"]}
          locations={[0.3, 0.65, 1]}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
          }}
          pointerEvents="none"
        />

        <Pressable
          onPress={onFavorite}
          hitSlop={12}
          className="absolute top-3 right-3 w-9 h-9 rounded-full items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.35)" }}
          accessibilityLabel={t("home.vibe.favoriteA11y")}
        >
          <Ionicons
            name={saved ? "heart" : "heart-outline"}
            size={20}
            color={saved ? "#ff453a" : "#fff"}
          />
        </Pressable>

        <View className="absolute left-0 right-0 bottom-0 p-4 gap-1">
          <AppText className="text-[18px] font-bold" style={{ color: "#fff" }}>
            {name}
          </AppText>
          <AppText
            className="text-[13px]"
            style={{ color: "rgba(255,255,255,0.85)" }}
          >
            {t(dest.vibeKey)}
          </AppText>
        </View>
      </View>
    </AnimatedPressable>
  );
}
