// Central de Reservas (RF10). O sheet só abre busca de OTA — sem preço.
// Vidro não entra: o fundo é opaco, não há nada atrás pra amostrar.

import { Ionicons } from "@expo/vector-icons";
import { useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText } from "@/components/ui/AppText";
import { useIsOffline } from "@/hooks/use-is-offline";
import { useTheme } from "@/hooks/use-theme";
import {
  buildAirbnbStaysUrl,
  buildBookingHotelsUrl,
  buildCarRentalUrl,
  buildEsimUrl,
  buildGetYourGuideUrl,
  buildInsuranceUrl,
  buildSkyscannerFlightsUrl,
} from "@/lib/affiliates";
import * as Haptics from "@/lib/haptics";
import { openPartnerUrl } from "@/lib/openPartnerUrl";
import { formatTripDateSpan, optionalIsoDate } from "@/lib/tripDates";

const ENTER = { duration: 240, easing: Easing.out(Easing.cubic) };
const DISMISS_MS = 180;
const DISMISS_Y = 100;
const PRESS_MS = 100;
const SCALE_PRESSED = 0.97;

// Cor só no tile. O card continua na surface do tema.
const MARK = {
  booking: "#003580",
  airbnb: "#FF385C",
  skyscanner: "#0770E3",
  gyg: "#FF5533",
  airalo: "#5B21B6",
  cars: "#E85D04",
  insurance: "#0F766E",
} as const;

export type TicketStop = {
  id: string;
  title: string;
};

type HubProps = {
  visible: boolean;
  destination: string;
  startDate?: string | null;
  endDate?: string | null;
  tickets: TicketStop[];
  onClose: () => void;
};

type TeaserProps = {
  destination: string;
  startDate?: string | null;
  endDate?: string | null;
  onPress: () => void;
};

function dateSpan(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  locale: string,
): string {
  const checkIn = optionalIsoDate(startDate);
  const checkOut = optionalIsoDate(endDate);
  if (!checkIn || !checkOut) return "";
  return formatTripDateSpan(checkIn, checkOut, locale);
}

function withDates(base: string, dates: string): string {
  return dates ? `${base} · ${dates}` : base;
}

function Mark({
  letter,
  color,
  compact = false,
}: {
  letter: string;
  color: string;
  compact?: boolean;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        compact ? styles.mini : styles.mark,
        { backgroundColor: color },
      ]}
    >
      <AppText
        className={compact ? "text-[11px] font-bold" : "text-[16px] font-bold"}
        style={{
          color: theme.presenceText,
          lineHeight: compact ? 14 : 20,
        }}
      >
        {letter}
      </AppText>
    </View>
  );
}

function PartnerLine({
  letter,
  color,
  title,
  subtitle,
  a11y,
  onPress,
  disabled,
  showDivider,
}: {
  letter: string;
  color: string;
  title: string;
  subtitle: string;
  a11y: string;
  onPress: () => void;
  disabled: boolean;
  showDivider: boolean;
}) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const pressed = useSharedValue(0);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * (1 - SCALE_PRESSED) }],
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
          disabled={disabled}
          onPressIn={() => setPressed(true)}
          onPressOut={() => setPressed(false)}
          onPress={onPress}
          accessibilityRole="link"
          accessibilityLabel={a11y}
          accessibilityState={{ disabled }}
          style={styles.row}
        >
          <Mark letter={letter} color={color} />
          <View style={styles.copy}>
            <AppText className="text-[15px] font-semibold" numberOfLines={2}>
              {title}
            </AppText>
            <AppText tone="secondary" className="text-[12px]" numberOfLines={2}>
              {subtitle}
            </AppText>
          </View>
          <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
        </Pressable>
      </Animated.View>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.section}>
      <AppText tone="muted" className="text-[12px] font-semibold">
        {title}
      </AppText>
      <View
        style={[
          styles.group,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

export function BookingHubTeaser({
  destination,
  startDate,
  endDate,
  onPress,
}: TeaserProps) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const pressed = useSharedValue(0);
  const city = destination.trim();
  const dates = dateSpan(startDate, endDate, i18n.language || "pt-BR");

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * (1 - SCALE_PRESSED) }],
  }));

  if (!city) return null;

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

  const subtitle = dates
    ? t("tripDetail.partners.hubSubtitleDates", { destination: city, dates })
    : city;

  return (
    <Animated.View style={[styles.teaserWrap, animStyle]}>
      <Pressable
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress();
        }}
        accessibilityRole="button"
        accessibilityLabel={`${t("tripDetail.partners.hubA11y", {
          destination: city,
        })}. ${t("tripDetail.partners.affiliateTag")}`}
        style={[
          styles.teaser,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        <View style={styles.copy}>
          <AppText className="text-[15px] font-semibold" numberOfLines={1}>
            {t("tripDetail.partners.hubTitle")}
          </AppText>
          <AppText tone="secondary" className="text-[12px]" numberOfLines={1}>
            {subtitle}
          </AppText>
          <AppText tone="muted" className="text-[11px]" numberOfLines={1}>
            {t("tripDetail.partners.affiliateTag")}
          </AppText>
        </View>
        <View style={styles.marks}>
          <Mark letter="B" color={MARK.booking} compact />
          <Mark letter="S" color={MARK.skyscanner} compact />
          <Mark letter="G" color={MARK.gyg} compact />
        </View>
        <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
      </Pressable>
    </Animated.View>
  );
}

export function BookingHubSheet({
  visible,
  destination,
  startDate,
  endDate,
  tickets,
  onClose,
}: HubProps) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const offline = useIsOffline();
  const reduceMotion = useReducedMotion();
  const translateY = useSharedValue(400);
  const backdrop = useSharedValue(0);

  const scrollMax = Dimensions.get("window").height * 0.72;
  const city = destination.trim();
  const dates = dateSpan(startDate, endDate, i18n.language || "pt-BR");
  const checkIn = optionalIsoDate(startDate);
  const checkOut = optionalIsoDate(endDate);
  const subtitle = dates
    ? t("tripDetail.partners.hubSubtitleDates", { destination: city, dates })
    : city;

  useEffect(() => {
    if (!visible) return;
    if (reduceMotion) {
      translateY.value = 0;
      backdrop.value = 1;
      return;
    }
    translateY.value = 400;
    backdrop.value = 0;
    translateY.value = withTiming(0, ENTER);
    backdrop.value = withTiming(1, {
      duration: 200,
      easing: Easing.out(Easing.quad),
    });
  }, [visible, reduceMotion, translateY, backdrop]);

  function finishClose() {
    onClose();
  }

  function dismiss() {
    if (reduceMotion) {
      onClose();
      return;
    }
    translateY.value = withTiming(500, { duration: DISMISS_MS }, (finished) => {
      if (finished) runOnJS(finishClose)();
    });
    backdrop.value = withTiming(0, { duration: 160 });
  }

  const pan = Gesture.Pan()
    .activeOffsetY(12)
    .failOffsetX([-20, 20])
    .onUpdate((e) => {
      if (e.translationY > 0) {
        translateY.value = e.translationY;
      }
    })
    .onEnd((e) => {
      if (e.translationY > DISMISS_Y || e.velocityY > 800) {
        runOnJS(dismiss)();
      } else {
        translateY.value = withTiming(0, ENTER);
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdrop.value * 0.5,
  }));

  function open(url: string) {
    if (offline) return;
    void openPartnerUrl(url);
  }

  const staySubtitle = withDates(
    t("tripDetail.partners.staySubtitle", { destination: city }),
    dates,
  );
  const flightsSubtitle = withDates(
    t("tripDetail.partners.flightsSubtitle", { destination: city }),
    dates,
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={dismiss}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <GestureHandlerRootView style={styles.fill}>
        <View style={[styles.fill, styles.end]}>
          <Animated.View style={[styles.backdrop, backdropStyle]}>
            <Pressable style={styles.fill} onPress={dismiss} />
          </Animated.View>

          <GestureDetector gesture={pan}>
            <Animated.View
              style={[
                styles.sheet,
                sheetStyle,
                {
                  backgroundColor: theme.background,
                  paddingBottom: Math.max(insets.bottom, 16),
                },
              ]}
            >
              <View style={styles.handleHit}>
                <View
                  style={[styles.handle, { backgroundColor: theme.textMuted }]}
                />
              </View>

              <View style={styles.header}>
                <AppText className="text-[20px] font-bold">
                  {t("tripDetail.partners.hubTitle")}
                </AppText>
                {city ? (
                  <AppText tone="secondary" className="text-[13px]" numberOfLines={2}>
                    {subtitle}
                  </AppText>
                ) : null}
              </View>

              <ScrollView
                style={[styles.scroll, { maxHeight: scrollMax }]}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
              >
                {offline ? (
                  <AppText tone="secondary" className="text-[13px]">
                    {t("tripDetail.partners.offlineHint")}
                  </AppText>
                ) : null}

                <Section title={t("tripDetail.partners.sectionStay")}>
                  <PartnerLine
                    letter="B"
                    color={MARK.booking}
                    title={t("tripDetail.partners.hotelsPartner")}
                    subtitle={staySubtitle}
                    a11y={t("tripDetail.partners.hotelsA11y", { destination: city })}
                    disabled={offline}
                    showDivider={false}
                    onPress={() =>
                      open(
                        buildBookingHotelsUrl({
                          destination: city,
                          checkIn,
                          checkOut,
                        }),
                      )
                    }
                  />
                  <PartnerLine
                    letter="A"
                    color={MARK.airbnb}
                    title={t("tripDetail.partners.airbnbPartner")}
                    subtitle={staySubtitle}
                    a11y={t("tripDetail.partners.airbnbA11y", { destination: city })}
                    disabled={offline}
                    showDivider
                    onPress={() =>
                      open(
                        buildAirbnbStaysUrl({
                          destination: city,
                          checkIn,
                          checkOut,
                        }),
                      )
                    }
                  />
                </Section>

                <Section title={t("tripDetail.partners.sectionFlights")}>
                  <PartnerLine
                    letter="S"
                    color={MARK.skyscanner}
                    title={t("tripDetail.partners.flightsPartner")}
                    subtitle={flightsSubtitle}
                    a11y={t("tripDetail.partners.flightsA11y", {
                      destination: city,
                    })}
                    disabled={offline}
                    showDivider={false}
                    onPress={() =>
                      open(
                        buildSkyscannerFlightsUrl({
                          destination: city,
                          outboundDate: checkIn,
                          inboundDate: checkOut,
                        }),
                      )
                    }
                  />
                </Section>

                <Section title={t("tripDetail.partners.sectionTickets")}>
                  {tickets.length === 0 ? (
                    <AppText
                      tone="secondary"
                      className="text-[13px]"
                      style={styles.empty}
                    >
                      {t("tripDetail.partners.emptyTickets")}
                    </AppText>
                  ) : (
                    tickets.map((stop, index) => (
                      <PartnerLine
                        key={stop.id}
                        letter="G"
                        color={MARK.gyg}
                        title={stop.title}
                        subtitle={t("tripDetail.partners.ticketRowSubtitle")}
                        a11y={t("tripDetail.partners.ticketsA11y", {
                          title: stop.title,
                        })}
                        disabled={offline}
                        showDivider={index > 0}
                        onPress={() => {
                          const q = [stop.title, city].filter(Boolean).join(" ");
                          open(buildGetYourGuideUrl(q));
                        }}
                      />
                    ))
                  )}
                </Section>

                <Section title={t("tripDetail.partners.sectionExtras")}>
                  <PartnerLine
                    letter="e"
                    color={MARK.airalo}
                    title={t("tripDetail.partners.esimTitle")}
                    subtitle={t("tripDetail.partners.esimSubtitle", {
                      destination: city,
                    })}
                    a11y={t("tripDetail.partners.esimA11y", { destination: city })}
                    disabled={offline}
                    showDivider={false}
                    onPress={() => open(buildEsimUrl(city))}
                  />
                  <PartnerLine
                    letter="P"
                    color={MARK.insurance}
                    title={t("tripDetail.partners.insuranceTitle")}
                    subtitle={t("tripDetail.partners.insuranceSubtitle", {
                      destination: city,
                    })}
                    a11y={t("tripDetail.partners.insuranceA11y", {
                      destination: city,
                    })}
                    disabled={offline}
                    showDivider
                    onPress={() => open(buildInsuranceUrl())}
                  />
                  <PartnerLine
                    letter="D"
                    color={MARK.cars}
                    title={t("tripDetail.partners.carsTitle")}
                    subtitle={withDates(
                      t("tripDetail.partners.carsSubtitle", { destination: city }),
                      dates,
                    )}
                    a11y={t("tripDetail.partners.carsA11y", { destination: city })}
                    disabled={offline}
                    showDivider
                    onPress={() =>
                      open(
                        buildCarRentalUrl({
                          destination: city,
                          checkIn,
                          checkOut,
                        }),
                      )
                    }
                  />
                </Section>

                <AppText tone="muted" className="text-[11px]">
                  {t("tripDetail.partners.disclaimer")}
                </AppText>
              </ScrollView>
            </Animated.View>
          </GestureDetector>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  end: { justifyContent: "flex-end" },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#000",
  },
  sheet: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    maxHeight: "88%",
    overflow: "hidden",
  },
  handleHit: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 8,
  },
  handle: {
    width: 40,
    height: 5,
    borderRadius: 3,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    gap: 2,
  },
  scroll: { flexGrow: 0, flexShrink: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 16,
  },
  section: { gap: 6 },
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
  copy: { flex: 1, minWidth: 0, gap: 1 },
  mark: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  mini: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  marks: { flexDirection: "row", alignItems: "center", gap: 4 },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 66,
  },
  empty: { paddingHorizontal: 14, paddingVertical: 14 },
  teaserWrap: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
  },
  teaser: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
});
