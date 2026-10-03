// Interstitial de house ad. O contrato é o de rede: tela cheia, 5s sem
// Pular, toque no criativo é o clique. Sem mp4 — a barra linear é o “vídeo”.

import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BackHandler,
  Modal,
  Platform,
  StatusBar as RNStatusBar,
  useColorScheme,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import {
  initialWindowMetrics,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { AppText } from "@/components/ui/AppText";
import { Colors } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import {
  INTERSTITIAL_SKIP_AFTER_MS,
  canOpenHouseAdNow,
  canSkipInterstitial,
} from "@/lib/houseAds";
import * as Haptics from "@/lib/haptics";
import { openHouseAd } from "@/lib/openHouseAd";
import { useAuthStore } from "@/stores/authStore";
import { useHouseAdStore } from "@/stores/houseAdStore";
import { Pressable, View } from "@/tw";

const ON_ACCENT = Colors.light.buttonText;
// O Modal do anúncio precisa soltar a tela antes do paywall abrir outro Modal.
const HANDOFF_MS = 280;

export function HouseAdInterstitial() {
  const { t } = useTranslation();
  const theme = useTheme();
  const scheme = useColorScheme();
  const insets = useSafeAreaInsets();
  // Modal edge-to-edge: o hook às vezes devolve 0 e a barra sobe no relógio.
  const topInset = Math.max(
    insets.top,
    initialWindowMetrics?.insets.top ?? 0,
    Platform.OS === "android" ? (RNStatusBar.currentHeight ?? 0) : 0,
  );
  const bottomInset = Math.max(
    insets.bottom,
    initialWindowMetrics?.insets.bottom ?? 0,
  );
  const visible = useHouseAdStore((s) => s.visible);
  const creative = useHouseAdStore((s) => s.creative);
  const close = useHouseAdStore((s) => s.close);
  const user = useAuthStore((s) => s.user);
  const isPremium = useAuthStore((s) => s.isPremium);

  const [remaining, setRemaining] = useState(5);
  const [skipReady, setSkipReady] = useState(false);
  const progress = useSharedValue(0);

  const barStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  useEffect(() => {
    if (!visible) return;
    if (!user || isPremium) close();
  }, [visible, user, isPremium, close]);

  useEffect(() => {
    if (!visible) {
      progress.value = 0;
      setRemaining(5);
      setSkipReady(false);
      return;
    }

    progress.value = 0;
    progress.value = withTiming(1, {
      duration: INTERSTITIAL_SKIP_AFTER_MS,
      easing: Easing.linear,
    });

    const startedAt = Date.now();
    let announced = false;
    const id = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      if (canSkipInterstitial(elapsed)) {
        setSkipReady(true);
        if (!announced) {
          announced = true;
          console.info("[ads] Pular liberado");
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        clearInterval(id);
        return;
      }
      const left = Math.ceil((INTERSTITIAL_SKIP_AFTER_MS - elapsed) / 1000);
      setRemaining(Math.max(1, left));
    }, 200);

    return () => clearInterval(id);
  }, [visible, progress]);

  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!skipReady) return true;
      close();
      return true;
    });
    return () => sub.remove();
  }, [visible, skipReady, close]);

  function onRequestClose() {
    if (!skipReady) return;
    close();
  }

  function onActivate() {
    // O fechar do roteiro não pode virar clique no anúncio.
    if (!canOpenHouseAdNow()) return;
    const current = useHouseAdStore.getState().creative;
    close();
    if (!current) return;
    setTimeout(() => {
      void openHouseAd(current);
    }, HANDOFF_MS);
  }

  const title = creative ? t(creative.titleKey) : "";
  const body = creative ? t(creative.bodyKey) : "";
  const cta = creative ? t(creative.ctaKey) : "";

  return (
    <Modal
      visible={visible && creative != null}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={onRequestClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View
        className="flex-1"
        style={{ backgroundColor: theme.background, paddingTop: topInset }}
      >
        <StatusBar style={scheme === "dark" ? "light" : "dark"} />
        <View
          className="h-1 w-full overflow-hidden"
          style={{ backgroundColor: theme.border }}
        >
          <Animated.View
            style={[
              { height: 4, backgroundColor: theme.accent },
              barStyle,
            ]}
          />
        </View>

        <View
          className="flex-row items-center justify-between px-5 pt-3 pb-6"
          style={{ backgroundColor: theme.background }}
        >
          <View
            className="rounded-full px-2.5 py-1"
            style={{ backgroundColor: theme.surface }}
          >
            <AppText tone="muted" className="text-[11px] font-medium">
              {t("ads.sponsored")}
            </AppText>
          </View>
          {skipReady ? (
            <Pressable
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                close();
              }}
              accessibilityRole="button"
              accessibilityLabel={t("ads.skip")}
              className="h-11 items-center justify-center rounded-full px-4"
              style={{ backgroundColor: theme.surface }}
            >
              <AppText className="text-[15px] font-semibold">
                {t("ads.skip")}
              </AppText>
            </Pressable>
          ) : (
            <View
              className="h-11 items-center justify-center rounded-full px-4"
              style={{ backgroundColor: theme.surface }}
            >
              <AppText tone="secondary" className="text-[13px] font-semibold">
                {t("ads.skipIn", { count: Math.max(remaining, 1) })}
              </AppText>
            </View>
          )}
        </View>

        <View className="flex-1 justify-end px-8 pb-8">
          <LinearGradient
            colors={[theme.accent, theme.background]}
            locations={[0, 0.7]}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: 420,
            }}
          />
          <View className="items-center">
            <View
              className="mb-6 h-24 w-24 items-center justify-center rounded-full"
              style={{ backgroundColor: theme.accent }}
            >
              <AppText
                className="text-[40px] font-bold"
                style={{ color: ON_ACCENT }}
              >
                {creative?.mark ?? "P"}
              </AppText>
            </View>
            <AppText className="text-center text-[28px] font-bold">
              {title}
            </AppText>
            <AppText tone="secondary" className="mt-2 text-center text-[15px]">
              {body}
            </AppText>
          </View>
        </View>

        <View
          className="px-5"
          style={{ paddingBottom: bottomInset + 16 }}
        >
          <Pressable
            onPress={onActivate}
            accessibilityRole="button"
            accessibilityLabel={t("ads.a11y", {
              label: t("ads.sponsored"),
              title,
              cta,
            })}
            className="h-11 items-center justify-center rounded-full"
            style={{ backgroundColor: theme.accent }}
          >
            <AppText
              className="text-[16px] font-semibold"
              style={{ color: ON_ACCENT }}
            >
              {cta}
            </AppText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
