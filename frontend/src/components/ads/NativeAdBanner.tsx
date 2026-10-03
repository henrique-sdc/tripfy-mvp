// Card de house ad. Não usa o chrome de viagem: o rótulo Patrocinado
// deixa claro que o toque não abre um roteiro.

import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { AppText } from "@/components/ui/AppText";
import { Colors } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import type { HouseAdCreative } from "@/lib/houseAds";
import { openHouseAd, type HouseAdTarget } from "@/lib/openHouseAd";
import { AnimatedView, Pressable, View } from "@/tw";

const PRESS_MS = 100;
const ON_TILE = Colors.light.buttonText;

// Cor só no tile do parceiro. O card segue a surface do tema.
const PARTNER_TILE = {
  booking: "#003580",
  skyscanner: "#0770E3",
} as const;

type Props = HouseAdTarget & {
  creative: HouseAdCreative;
};

export function NativeAdBanner({
  creative,
  destination,
  startDate,
  endDate,
}: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const pressed = useSharedValue(0);

  const title = t(creative.titleKey);
  const body = t(creative.bodyKey, { destination: destination?.trim() ?? "" });
  const cta = t(creative.ctaKey);
  const tileColor =
    creative.partner != null ? PARTNER_TILE[creative.partner] : theme.accent;

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * 0.03 }],
  }));

  function setPressed(next: boolean) {
    pressed.value = withTiming(next ? 1 : 0, {
      duration: PRESS_MS,
      easing: Easing.out(Easing.cubic),
    });
  }

  return (
    <AnimatedView style={animStyle}>
      <Pressable
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        onPress={() => {
          void openHouseAd(creative, { destination, startDate, endDate });
        }}
        accessibilityRole="button"
        accessibilityLabel={t("ads.a11y", {
          label: t("ads.sponsored"),
          title,
          cta,
        })}
        className="rounded-3xl border p-4"
        style={{ backgroundColor: theme.surface, borderColor: theme.border }}
      >
        <View className="flex-row gap-3">
          <View
            className="h-16 w-16 items-center justify-center rounded-2xl"
            style={{ backgroundColor: tileColor }}
          >
            <AppText
              className="text-[22px] font-bold"
              style={{ color: ON_TILE }}
            >
              {creative.mark}
            </AppText>
          </View>
          <View className="flex-1 gap-1">
            <View className="flex-row items-start justify-between gap-2">
              <AppText
                className="flex-1 text-[15px] font-semibold"
                numberOfLines={2}
              >
                {title}
              </AppText>
              <View
                className="rounded-full px-2 py-0.5"
                style={{ backgroundColor: theme.background }}
              >
                <AppText tone="muted" className="text-[11px] font-medium">
                  {t("ads.sponsored")}
                </AppText>
              </View>
            </View>
            <AppText tone="secondary" className="text-[13px]" numberOfLines={2}>
              {body}
            </AppText>
          </View>
        </View>
        <View className="mt-3 h-11 flex-row items-center justify-end gap-1">
          <AppText tone="accent" className="text-[14px] font-semibold">
            {cta}
          </AppText>
          <Ionicons name="chevron-forward" size={16} color={theme.accent} />
        </View>
      </Pressable>
    </AnimatedView>
  );
}
