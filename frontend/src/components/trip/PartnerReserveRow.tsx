// Agrupado iOS de CTAs de OTA (RF10) — surface + hairline, sem cor de marca.

import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { AppText } from "@/components/ui/AppText";
import { useTheme } from "@/hooks/use-theme";
import {
  buildBookingHotelsUrl,
  buildSkyscannerFlightsUrl,
} from "@/lib/affiliates";
import { openPartnerUrl } from "@/lib/openPartnerUrl";
import { formatTripDateSpan, optionalIsoDate } from "@/lib/tripDates";

const PRESS_MS = 100;
const SCALE_PRESSED = 0.97;

type Props = {
  destination: string;
  startDate?: string | null;
  endDate?: string | null;
};

type RowSpec = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  partner: string;
  a11y: string;
  url: string;
};

function PartnerRow({
  spec,
  showDivider,
  dateLabel,
}: {
  spec: RowSpec;
  showDivider: boolean;
  dateLabel: string;
}) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const pressed = useSharedValue(0);

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: 1 - pressed.value * (1 - SCALE_PRESSED),
      },
    ],
  }));

  function setPressed(next: boolean) {
    if (reduceMotion) {
      pressed.value = next ? 1 : 0;
      return;
    }
    pressed.value = withTiming(next ? 1 : 0, {
      duration: PRESS_MS,
      easing: Easing.out(Easing.cubic),
    });
  }

  return (
    <View>
      {showDivider ? (
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
      ) : null}
      <Animated.View style={animStyle}>
        <Pressable
          onPressIn={() => setPressed(true)}
          onPressOut={() => setPressed(false)}
          onPress={() => {
            void openPartnerUrl(spec.url);
          }}
          accessibilityRole="link"
          accessibilityLabel={spec.a11y}
          style={styles.row}
        >
          <View
            style={[styles.iconWrap, { backgroundColor: `${theme.accent}22` }]}
          >
            <Ionicons name={spec.icon} size={18} color={theme.accent} />
          </View>
          <View style={styles.copy}>
            <AppText className="text-[15px] font-semibold" numberOfLines={1}>
              {spec.title}
            </AppText>
            {dateLabel ? (
              <AppText tone="secondary" className="text-[12px]" numberOfLines={1}>
                {dateLabel}
              </AppText>
            ) : null}
          </View>
          <AppText tone="muted" className="text-[11px]">
            {spec.partner}
          </AppText>
          <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
        </Pressable>
      </Animated.View>
    </View>
  );
}

export function PartnerReserveRow({
  destination,
  startDate,
  endDate,
}: Props) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();

  const checkIn = optionalIsoDate(startDate);
  const checkOut = optionalIsoDate(endDate);
  const dateLabel =
    checkIn && checkOut
      ? formatTripDateSpan(checkIn, checkOut, i18n.language || "pt-BR")
      : "";

  const city = destination.trim();
  if (!city) return null;

  const rows: RowSpec[] = [
    {
      icon: "bed-outline",
      title: t("tripDetail.partners.hotelsTitle", { destination: city }),
      partner: t("tripDetail.partners.hotelsPartner"),
      a11y: t("tripDetail.partners.hotelsA11y", { destination: city }),
      url: buildBookingHotelsUrl({
        destination: city,
        checkIn,
        checkOut,
      }),
    },
    {
      icon: "airplane-outline",
      title: t("tripDetail.partners.flightsTitle", { destination: city }),
      partner: t("tripDetail.partners.flightsPartner"),
      a11y: t("tripDetail.partners.flightsA11y", { destination: city }),
      url: buildSkyscannerFlightsUrl({
        destination: city,
        outboundDate: checkIn,
        inboundDate: checkOut,
      }),
    },
  ];

  return (
    <View
      style={styles.block}
      accessibilityLabel={t("tripDetail.partners.sectionA11y")}
    >
      <View
        style={[
          styles.group,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        {rows.map((spec, i) => (
          <PartnerRow
            key={spec.partner}
            spec={spec}
            showDivider={i > 0}
            dateLabel={dateLabel}
          />
        ))}
      </View>
      <AppText tone="muted" className="text-[11px]" style={styles.disclaimer}>
        {t("tripDetail.partners.disclaimer")}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    gap: 6,
  },
  group: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 54,
  },
  disclaimer: {
    paddingHorizontal: 4,
  },
});
