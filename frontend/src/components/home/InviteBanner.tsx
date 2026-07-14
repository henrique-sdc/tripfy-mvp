// Banner de Match — swipe-to-delete estilo Alarmes iOS.
// Fundo vermelho full-bleed atrás; o card desliza por cima (sem gap / linha vazando).

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { AppText } from "@/components/ui/AppText";
import { useTheme } from "@/hooks/use-theme";
import { Pressable, View } from "@/tw";

const DELETE_W = 80;
const OPEN_X = -DELETE_W;
const SPRING = { damping: 24, stiffness: 280 };

type InviteBannerProps = {
  inviterName: string;
  destination: string;
  onAccept?: () => void;
  onDismiss?: () => void;
};

export function InviteBanner({
  inviterName,
  destination,
  onAccept,
  onDismiss,
}: InviteBannerProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const translateX = useSharedValue(0);
  const startX = useSharedValue(0);

  function dismiss() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onDismiss?.();
  }

  function lightHaptic() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-12, 12])
    .onBegin(() => {
      startX.value = translateX.value;
    })
    .onUpdate((e) => {
      const next = startX.value + e.translationX;
      // Só esquerda; sem overshoot além do botão.
      translateX.value = Math.min(0, Math.max(next, OPEN_X));
    })
    .onEnd((e) => {
      const shouldOpen = translateX.value < OPEN_X / 2 || e.velocityX < -500;
      const shouldDelete = e.velocityX < -1100 || translateX.value <= OPEN_X + 4;

      if (shouldDelete && onDismiss) {
        translateX.value = withTiming(-420, { duration: 160 }, (done) => {
          if (done) runOnJS(dismiss)();
        });
        return;
      }

      translateX.value = withSpring(shouldOpen ? OPEN_X : 0, SPRING);
      if (shouldOpen) runOnJS(lightHaptic)();
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  // Ícone da lixeira some quando o card cobre tudo; aparece conforme abre.
  const trashStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [0, OPEN_X / 2, OPEN_X],
      [0, 0.4, 1],
      Extrapolation.CLAMP,
    ),
  }));

  return (
    <View style={styles.clip}>
      {/* Camada delete: vermelho em TODA a área (sem faixa estreita / gap preto). */}
      <View style={[styles.deleteLayer, { backgroundColor: "#ff3b30" }]}>
        <Animated.View style={[styles.trashHit, trashStyle]}>
          <Pressable
            onPress={dismiss}
            accessibilityLabel={t("home.invite.dismissA11y")}
            style={styles.trashBtn}
          >
            <Ionicons name="trash" size={22} color="#fff" />
          </Pressable>
        </Animated.View>
      </View>

      <GestureDetector gesture={pan}>
        <Animated.View
          style={[
            cardStyle,
            styles.card,
            {
              backgroundColor: theme.surface,
              borderColor: theme.accent,
            },
          ]}
        >
          <Pressable
            onPress={() => {
              if (translateX.value < -8) {
                translateX.value = withSpring(0, SPRING);
                return;
              }
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onAccept?.();
            }}
            style={styles.cardInner}
          >
            <View
              className="w-11 h-11 rounded-full items-center justify-center"
              style={{ backgroundColor: `${theme.accent}22` }}
            >
              <AppText className="text-[20px]">✈️</AppText>
            </View>

            <View style={styles.copy}>
              <AppText className="text-[14px] font-medium leading-5">
                {t("home.invite.message", {
                  name: inviterName,
                  destination,
                })}
              </AppText>
              <AppText tone="accent" className="text-[13px] font-bold">
                {t("home.invite.accept")}
              </AppText>
            </View>
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    borderRadius: 16,
    overflow: "hidden",
    position: "relative",
  },
  deleteLayer: {
    ...StyleSheet.absoluteFill,
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  trashHit: {
    width: DELETE_W,
    height: "100%",
  },
  trashBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    // Garante que o card cubra 100% do vermelho em repouso.
    backgroundColor: "#fff",
  },
  cardInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  copy: {
    flex: 1,
    gap: 4,
  },
});
