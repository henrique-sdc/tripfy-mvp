// Paywall Tripfy Pro: halo no accent do tema, Light e Dark iguais ao resto do app.
// Mock de TCC: o CTA não cobra; só chama POST /checkout/upgrade.

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Modal, useColorScheme } from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText } from "@/components/ui/AppText";
import { Colors } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import * as Haptics from "@/lib/haptics";
import { upgradeCheckout } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { usePaywallStore } from "@/stores/paywallStore";
import { Pressable, ScrollView, View } from "@/tw";

const ENTER_MS = 240;
const PRESS_SPRING = { damping: 20, stiffness: 300 };
// Texto em cima do roxo: o `buttonText` do dark vira preto e some no accent.
const ON_ACCENT = Colors.light.buttonText;

const BENEFITS = [
  { key: "unlimited" as const, soon: false, icon: "map-outline" as const },
  { key: "match" as const, soon: true, icon: "people-outline" as const },
  { key: "offline" as const, soon: true, icon: "cloud-offline-outline" as const },
];

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function PaywallScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const scheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const visible = usePaywallStore((s) => s.visible);
  const close = usePaywallStore((s) => s.close);
  const applySync = useAuthStore((s) => s.applySync);
  const isPremium = useAuthStore((s) => s.isPremium);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ctaScale = useSharedValue(1);

  const ctaStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ctaScale.value }],
  }));

  useEffect(() => {
    if (!visible) return;
    setError(null);
    setLoading(false);
  }, [visible]);

  function onClose() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    close();
  }

  async function onUpgrade() {
    if (isPremium) {
      close();
      return;
    }
    setLoading(true);
    setError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const result = await upgradeCheckout();
      applySync({
        has_preferences: result.has_preferences,
        is_premium: Boolean(result.is_premium),
        tier: result.tier === "pro" ? "pro" : "free",
        premium_until: result.premium_until ?? null,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      close();
    } catch (err) {
      console.error("[paywall] upgrade:", err);
      setError(t("paywall.error"));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View className="flex-1" style={{ backgroundColor: theme.background }}>
        <StatusBar style={scheme === "dark" ? "light" : "dark"} />
        <LinearGradient
          colors={[theme.accent, theme.background]}
          locations={[0, 0.55]}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 340,
          }}
        />

        <View
          className="flex-row items-center px-6"
          style={{ paddingTop: insets.top + 8, paddingBottom: 4 }}
        >
          <Pressable
            onPress={onClose}
            hitSlop={12}
            className="w-10 h-10 rounded-full items-center justify-center"
            style={{ backgroundColor: theme.surface }}
            accessibilityLabel={t("paywall.close")}
          >
            <Ionicons name="close" size={22} color={theme.textPrimary} />
          </Pressable>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingBottom: 24,
            gap: 20,
          }}
        >
          <Animated.View
            entering={FadeInDown.delay(40)
              .duration(ENTER_MS)
              .easing(Easing.out(Easing.cubic))}
          >
            <View className="flex-row items-center gap-2 mb-3">
              <AppText
                className="text-[22px] font-bold"
                style={{ letterSpacing: -0.4 }}
              >
                {t("paywall.brand")}
              </AppText>
              <View
                className="flex-row items-center gap-1 rounded-full px-2.5 py-1"
                style={{ backgroundColor: theme.accent }}
              >
                <Ionicons name="sparkles" size={12} color={ON_ACCENT} />
                <AppText
                  className="text-[11px] font-bold"
                  style={{ color: ON_ACCENT }}
                >
                  {t("paywall.proPill")}
                </AppText>
              </View>
            </View>
            <AppText
              className="text-[26px] font-bold leading-8"
              style={{ letterSpacing: -0.5 }}
            >
              {t("paywall.headline")}
            </AppText>
            <AppText tone="secondary" className="text-[15px] mt-2 leading-5">
              {t("paywall.subtitle")}
            </AppText>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(80)
              .duration(ENTER_MS)
              .easing(Easing.out(Easing.cubic))}
          >
            <View
              className="rounded-2xl border px-4 py-3.5 flex-row items-center gap-3"
              style={{
                backgroundColor: theme.surface,
                borderColor: theme.accent,
              }}
            >
              <View
                className="w-10 h-10 rounded-full items-center justify-center"
                style={{ backgroundColor: `${theme.accent}22` }}
              >
                <Ionicons name="gift-outline" size={20} color={theme.accent} />
              </View>
              <View className="flex-1">
                <AppText className="text-[15px] font-bold">
                  {t("paywall.trialCardTitle")}
                </AppText>
                <AppText tone="secondary" className="text-[13px] mt-0.5 leading-4">
                  {t("paywall.trialCardBody")}
                </AppText>
              </View>
            </View>
          </Animated.View>

          <View className="gap-2.5">
            <Animated.View
              entering={FadeInDown.delay(110)
                .duration(ENTER_MS)
                .easing(Easing.out(Easing.cubic))}
            >
              <View
                className="rounded-2xl border px-4 py-3.5"
                style={{
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                }}
              >
                <AppText
                  tone="muted"
                  className="text-[12px] font-semibold uppercase tracking-wide"
                >
                  {t("paywall.planFreeTitle")}
                </AppText>
                <AppText tone="secondary" className="text-[14px] mt-1 leading-5">
                  {t("paywall.planFreeBody")}
                </AppText>
              </View>
            </Animated.View>

            <Animated.View
              entering={FadeInDown.delay(140)
                .duration(ENTER_MS)
                .easing(Easing.out(Easing.cubic))}
            >
              <View
                className="rounded-2xl border px-4 py-3.5"
                style={{
                  backgroundColor: theme.surface,
                  borderColor: theme.accent,
                }}
              >
                <View className="flex-row items-center justify-between">
                  <AppText
                    className="text-[12px] font-semibold uppercase tracking-wide"
                    style={{ color: theme.accent }}
                  >
                    {t("paywall.planProTitle")}
                  </AppText>
                  <View
                    className="rounded-full px-2 py-0.5"
                    style={{ backgroundColor: theme.accent }}
                  >
                    <AppText
                      className="text-[10px] font-bold"
                      style={{ color: ON_ACCENT }}
                    >
                      {t("paywall.trialBadge")}
                    </AppText>
                  </View>
                </View>
                <AppText className="text-[14px] mt-1 leading-5">
                  {t("paywall.planProBody")}
                </AppText>
              </View>
            </Animated.View>
          </View>

          <AppText
            tone="muted"
            className="text-[13px] font-semibold uppercase tracking-wide mt-1"
          >
            {t("paywall.benefitsTitle")}
          </AppText>

          <View className="gap-2.5">
            {BENEFITS.map((item, index) => (
              <Animated.View
                key={item.key}
                entering={FadeInDown.delay(170 + index * 40)
                  .duration(ENTER_MS)
                  .easing(Easing.out(Easing.cubic))}
              >
                <View
                  className="flex-row items-start gap-3 rounded-2xl px-4 py-3.5"
                  style={{ backgroundColor: theme.surface }}
                >
                  <View
                    className="w-9 h-9 rounded-full items-center justify-center mt-0.5"
                    style={{ backgroundColor: `${theme.accent}22` }}
                  >
                    <Ionicons
                      name={item.icon}
                      size={18}
                      color={theme.accent}
                    />
                  </View>
                  <View className="flex-1">
                    <View className="flex-row items-center gap-2">
                      <AppText className="text-[15px] font-semibold flex-1">
                        {t(`paywall.benefit.${item.key}.title`)}
                      </AppText>
                      {item.soon ? (
                        <AppText
                          tone="muted"
                          className="text-[11px] font-semibold"
                        >
                          {t("paywall.soon")}
                        </AppText>
                      ) : null}
                    </View>
                    <AppText
                      tone="secondary"
                      className="text-[13px] mt-1 leading-4"
                    >
                      {t(`paywall.benefit.${item.key}.body`)}
                    </AppText>
                  </View>
                </View>
              </Animated.View>
            ))}
          </View>

          <AppText tone="muted" className="text-[13px] text-center mb-2">
            {t("paywall.moreSoon")}
          </AppText>
        </ScrollView>

        <View
          className="px-6 pt-3"
          style={{
            paddingBottom: insets.bottom + 16,
            backgroundColor: theme.background,
            borderTopWidth: 1,
            borderTopColor: theme.border,
          }}
        >
          <AppText
            tone="muted"
            className="text-[12px] text-center mb-3 leading-4"
          >
            {t("paywall.mockHint")}
          </AppText>
          <AnimatedPressable
            onPress={() => {
              void onUpgrade();
            }}
            onPressIn={() => {
              if (loading) return;
              ctaScale.value = withSpring(0.97, PRESS_SPRING);
            }}
            onPressOut={() => {
              ctaScale.value = withSpring(1, PRESS_SPRING);
            }}
            disabled={loading}
            style={[
              ctaStyle,
              {
                backgroundColor: theme.accent,
                opacity: loading ? 0.6 : 1,
              },
            ]}
            className="rounded-2xl py-3.5 items-center justify-center"
          >
            {loading ? (
              <ActivityIndicator color={ON_ACCENT} size="small" />
            ) : (
              <View className="items-center">
                <AppText
                  className="text-[16px] font-bold"
                  style={{ color: ON_ACCENT }}
                >
                  {t("paywall.cta")}
                </AppText>
                <AppText
                  className="text-[12px] mt-0.5"
                  style={{ color: ON_ACCENT }}
                >
                  {t("paywall.ctaSub")}
                </AppText>
              </View>
            )}
          </AnimatedPressable>
          {error ? (
            <AppText tone="error" className="text-[13px] text-center mt-3">
              {error}
            </AppText>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
