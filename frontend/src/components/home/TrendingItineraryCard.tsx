// Carrossel "Em Alta na Tripfy" — roteiros da comunidade (RF08).

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
import { useTheme } from "@/hooks/use-theme";
import { useWishlistStore } from "@/stores/wishlistStore";
import { Pressable, View } from "@/tw";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const SPRING = { damping: 20, stiffness: 300 };

export type TrendingItinerary = {
  id: string;
  image: string;
  titleKey: string;
  authorKey: string;
};

type Props = {
  item: TrendingItinerary;
  width: number;
};

export function TrendingItineraryCard({ item, width }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const toggle = useWishlistStore((s) => s.toggle);
  const saved = useWishlistStore((s) => s.has(item.id));
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const title = t(item.titleKey);
  const author = t(item.authorKey);

  function copyItinerary() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // ponytail: clonar no backend ainda não existe — salva na wishlist.
    if (!saved) {
      toggle({
        id: item.id,
        kind: "itinerary",
        title,
        image: item.image,
        subtitle: author,
      });
    }
  }

  return (
    <AnimatedPressable
      onPressIn={() => {
        scale.value = withSpring(0.97, SPRING);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, SPRING);
      }}
      style={[
        style,
        {
          width,
          backgroundColor: theme.surface,
          borderColor: theme.border,
        },
      ]}
      className="rounded-3xl overflow-hidden border mr-3"
    >
      <View style={{ height: width * 0.48 }}>
        <Image
          source={{ uri: item.image }}
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
        />
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.4)"]}
          style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "50%" }}
        />
      </View>
      <View className="p-3.5 gap-2">
        <AppText className="text-[15px] font-bold" numberOfLines={2}>
          {title}
        </AppText>
        <AppText tone="secondary" className="text-[12px]">
          {author}
        </AppText>
        <Pressable
          onPress={copyItinerary}
          className="mt-1 rounded-full py-2.5 items-center"
          style={{ backgroundColor: `${theme.accent}18` }}
        >
          <AppText tone="accent" className="text-[13px] font-bold">
            {saved ? t("home.trending.saved") : t("home.trending.copy")}
          </AppText>
        </Pressable>
      </View>
    </AnimatedPressable>
  );
}
