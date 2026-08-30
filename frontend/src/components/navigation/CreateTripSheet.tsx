// Sheet Premium — Solo vs Match (Modo Menu Flutuante).
// Animação suave e sem "quiques" (Cubic Bezier), com backdrop clicável.

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
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText } from "@/components/ui/AppText";
import { useTheme } from "@/hooks/use-theme";
import { useCreateTripSheetStore } from "@/stores/createTripSheetStore";
import { Pressable, View } from "@/tw";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Usamos Easing.out(Easing.cubic) para garantir que NÃO VAI QUICAR (Zero Bounce)
const ENTER_TIMING = { duration: 240, easing: Easing.out(Easing.cubic) };
const EXIT_TIMING = { duration: 180, easing: Easing.in(Easing.cubic) };

function RichChoiceCard({
  emoji,
  title,
  subtitle,
  animValue,
  delay,
  onPress,
}: {
  emoji: string;
  title: string;
  subtitle: string;
  animValue: SharedValue<number>;
  delay: number;
  onPress: () => void;
}) {
  const theme = useTheme();
  const scale = useSharedValue(1);

  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  // Animação de entrada mágica (Efeito Cascata / Stagger)
  const entranceStyle = useAnimatedStyle(() => {
    return {
      opacity: animValue.value,
      transform: [
        {
          translateY: interpolate(
            animValue.value,
            [0, 1],
            [30, 0],
            Extrapolation.CLAMP,
          ),
        },
        {
          scale: interpolate(
            animValue.value,
            [0, 1],
            [0.9, 1],
            Extrapolation.CLAMP,
          ),
        },
      ],
    };
  });

  return (
    <Animated.View style={[{ marginBottom: 12 }, entranceStyle]}>
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
            // Sombra sutil para destacar do fundo escurecido
            ...Platform.select({
              ios: {
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.12,
                shadowRadius: 14,
              },
              android: {
                elevation: 6,
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
  const insets = useSafeAreaInsets();
  const isOpen = useCreateTripSheetStore((s) => s.isOpen);
  const close = useCreateTripSheetStore((s) => s.close);

  // Valores de animação
  const backdropOpacity = useSharedValue(0);
  const titleAnim = useSharedValue(0);
  const groupAnim = useSharedValue(0);
  const soloAnim = useSharedValue(0);

  useEffect(() => {
    if (isOpen) {
      // Abre: Backdrop primeiro, depois o título, depois os cards de baixo pra cima
      backdropOpacity.value = withTiming(1, ENTER_TIMING);
      titleAnim.value = withDelay(50, withTiming(1, ENTER_TIMING));
      groupAnim.value = withDelay(100, withTiming(1, ENTER_TIMING));
      soloAnim.value = withDelay(150, withTiming(1, ENTER_TIMING));
    } else {
      // Reseta os valores imediatamente quando o modal é desmontado
      backdropOpacity.value = 0;
      titleAnim.value = 0;
      groupAnim.value = 0;
      soloAnim.value = 0;
    }
  }, [isOpen, backdropOpacity, titleAnim, groupAnim, soloAnim]);

  function finishClose() {
    close();
  }

  function dismiss() {
    // Fecha tudo ao mesmo tempo rapidamente
    titleAnim.value = withTiming(0, EXIT_TIMING);
    soloAnim.value = withTiming(0, EXIT_TIMING);
    groupAnim.value = withTiming(0, EXIT_TIMING);
    backdropOpacity.value = withTiming(0, EXIT_TIMING, (finished) => {
      if (finished) runOnJS(finishClose)();
    });
  }

  function goSolo() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    dismiss();
    setTimeout(() => router.push("/wizard/solo"), 200);
  }

  function goMatch() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    dismiss();
    setTimeout(() => router.push("/wizard/solo?mode=match" as Href), 200);
  }

  const backdropStyle = useAnimatedStyle(() => ({
    // Opacidade para 65% para escurecer bem e dar contraste ao texto
    opacity: backdropOpacity.value * 0.65,
  }));

  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleAnim.value,
    transform: [
      {
        translateY: interpolate(
          titleAnim.value,
          [0, 1],
          [10, 0],
          Extrapolation.CLAMP,
        ),
      },
    ],
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
      <View style={styles.fill}>
        {/* Backdrop escurecido */}
        <Animated.View style={[styles.backdrop, backdropStyle]} />

        {/* Camada invisível que pega o clique na tela toda para fechar */}
        <RNPressable style={styles.pressableArea} onPress={dismiss} />

        {/* Menu Flutuante posicionado acima da TabBar */}
        <View
          style={[
            styles.optionsWrap,
            // Aumentamos para +130 para ficar um pouco mais para cima
            { paddingBottom: insets.bottom + 130 },
          ]}
          pointerEvents="box-none"
        >
          {/* Título do Menu (Agora legível pelo fundo mais escuro) */}
          <Animated.View style={[styles.titleContainer, titleStyle]}>
            <AppText
              className="text-[24px] font-bold"
              style={{
                color: "#FFFFFF",
                letterSpacing: -0.5,
                textShadowColor: "rgba(0,0,0,0.3)", // Sombra sutil para garantia
                textShadowOffset: { width: 0, height: 1 },
                textShadowRadius: 4,
              }}
            >
              {t("createTrip.title")}
            </AppText>
            <AppText
              className="text-[14px] mt-1"
              style={{ color: "rgba(255,255,255,0.85)" }}
            >
              {t("createTrip.subtitle")}
            </AppText>
          </Animated.View>

          {/* Opções em Leque */}
          <RichChoiceCard
            emoji="🤝"
            title={t("createTrip.match")}
            subtitle={t("createTrip.matchSubtitle")}
            animValue={groupAnim} // Anima primeiro (fica embaixo)
            delay={0}
            onPress={goMatch}
          />

          <RichChoiceCard
            emoji="👤"
            title={t("createTrip.solo")}
            subtitle={t("createTrip.soloSubtitle")}
            animValue={soloAnim} // Anima depois (fica em cima)
            delay={0}
            onPress={goSolo}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backdrop: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#000",
  },
  pressableArea: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
  optionsWrap: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: 0,
  },
  titleContainer: {
    marginBottom: 20,
    paddingHorizontal: 8,
  },
});
