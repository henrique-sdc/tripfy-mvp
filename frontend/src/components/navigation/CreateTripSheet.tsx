// Sheet Premium — Solo vs Match.
// Animação de subida limpa e sólida (sem staggers que bugam a sombra no Android).

import * as Haptics from "expo-haptics";
import { Href, router } from "expo-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Modal,
  Platform,
  Pressable as RNPressable,
  StyleSheet,
} from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  Easing,
  FadeInDown,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText } from "@/components/ui/AppText";
import { useTheme } from "@/hooks/use-theme";
import { useCreateTripSheetStore } from "@/stores/createTripSheetStore";
import { Pressable, View } from "@/tw";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const TIMING = { duration: 240, easing: Easing.out(Easing.cubic) };
const DISMISS_Y = 100;

function RichChoiceCard({
  emoji,
  title,
  subtitle,
  delay,
  onPress,
}: {
  emoji: string;
  title: string;
  subtitle: string;
  delay: number;
  onPress: () => void;
}) {
  const theme = useTheme();
  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    // WRAPPER EXTERNO: Cuida apenas da animação de entrada mágica (Cascata)
    <Animated.View
      entering={FadeInDown.delay(delay)
        .duration(300)
        .easing(Easing.out(Easing.cubic))}
      style={{ marginBottom: 12 }} // Margem blindada nativamente
    >
      {/* BOTÃO INTERNO: Cuida apenas da animação de clique (Escala) */}
      <AnimatedPressable
        onPress={onPress}
        onPressIn={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          scale.value = withTiming(0.96, { duration: 100 });
        }}
        onPressOut={() => {
          scale.value = withTiming(1, { duration: 150 });
        }}
        style={[
          pressStyle,
          {
            backgroundColor: theme.surface,
            borderColor: theme.border,
            // Removemos o 'elevation' (sombra do Android) para não gerar o borrão cinza.
            // O visual Monochrome Premium se sustenta pela borda nítida!
            ...Platform.select({
              ios: {
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.05,
                shadowRadius: 12,
              },
            }),
          },
        ]}
        className="flex-row items-center gap-4 rounded-3xl border p-4"
      >
        <View
          className="w-14 h-14 rounded-full items-center justify-center"
          style={{ backgroundColor: `${theme.accent}15` }}
        >
          <AppText className="text-[26px]">{emoji}</AppText>
        </View>

        <View className="flex-1 gap-1">
          <View className="flex-row items-center gap-2">
            <AppText className="text-[17px] font-bold">{title}</AppText>
          </View>
          <AppText tone="secondary" className="text-[13px] leading-4 pr-2">
            {subtitle}
          </AppText>
        </View>
      </AnimatedPressable>
    </Animated.View>
  );
}

export function CreateTripSheet() {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const isOpen = useCreateTripSheetStore((s) => s.isOpen);
  const close = useCreateTripSheetStore((s) => s.close);

  const translateY = useSharedValue(400);
  const backdrop = useSharedValue(0);

  useEffect(() => {
    if (isOpen) {
      translateY.value = 400;
      backdrop.value = 0;
      translateY.value = withTiming(0, TIMING);
      backdrop.value = withTiming(1, {
        duration: 200,
        easing: Easing.out(Easing.quad),
      });
    }
  }, [isOpen, translateY, backdrop]);

  function finishClose() {
    close();
  }

  function dismiss() {
    translateY.value = withTiming(500, { duration: 200 }, (finished) => {
      if (finished) runOnJS(finishClose)();
    });
    backdrop.value = withTiming(0, { duration: 180 });
  }

  function goSolo() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    dismiss();
    setTimeout(() => router.push("/wizard/solo"), 240);
  }

  function goMatch() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    dismiss();
    setTimeout(
      () => router.push("/wizard/solo?mode=match" as Href),
      240,
    );
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
        translateY.value = withTiming(0, TIMING);
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdrop.value * 0.5,
  }));

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="none"
      onRequestClose={dismiss}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <GestureHandlerRootView style={styles.fill}>
        <View style={[styles.fill, styles.end]}>
          <Animated.View style={[styles.backdrop, backdropStyle]}>
            <RNPressable style={styles.fill} onPress={dismiss} />
          </Animated.View>

          <GestureDetector gesture={pan}>
            <Animated.View
              style={[
                sheetStyle,
                {
                  backgroundColor: theme.background,
                  borderTopLeftRadius: 32,
                  borderTopRightRadius: 32,
                  paddingBottom: Math.max(insets.bottom, 16) + 8,
                },
              ]}
            >
              <View style={styles.handleHit}>
                <View
                  style={[styles.handle, { backgroundColor: theme.textMuted }]}
                />
              </View>

              <View className="px-6 pt-2 pb-2">
                <View className="mb-6">
                  <AppText
                    className="text-[26px] font-bold"
                    style={{ letterSpacing: -0.5 }}
                  >
                    {t("createTrip.title")}
                  </AppText>
                  <AppText tone="secondary" className="text-[15px] mt-1">
                    {t("createTrip.subtitle")}
                  </AppText>
                </View>

                {/* Delay 100ms e 200ms para o efeito cascata mágico */}
                <RichChoiceCard
                  emoji="👤"
                  title={t("createTrip.solo")}
                  subtitle={t("createTrip.soloSubtitle")}
                  delay={100}
                  onPress={goSolo}
                />

                <RichChoiceCard
                  emoji="🤝"
                  title={t("createTrip.match")}
                  subtitle={t("createTrip.matchSubtitle")}
                  delay={200}
                  onPress={goMatch}
                />
              </View>
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
  handleHit: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 16,
  },
  handle: {
    width: 40,
    height: 5,
    borderRadius: 3,
  },
});
