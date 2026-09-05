// Linha com swipe-to-delete no padrão Mail / Alarmes do iOS.
//
// Solta na metade → trava num botão compacto, toque apaga.
// Arrasta até ~55% da largura (ou flick rápido) → desliza fora e apaga sozinho.
// No limiar: háptico uma vez; a lixeira cola na borda do card e acompanha.
//
// ReanimatedSwipeable não serve: a ação com flex:1 vira uma faixa vermelha
// do tamanho do overshoot, e o overshootFriction impede o commit. O gesto
// é o mesmo Pan do restante do app.

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import type { ReactNode } from "react";
import { Pressable as RNPressable, StyleSheet } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import {
  ACTION_WIDTH,
  COMMIT_RATIO,
  swipeReleaseIntent,
} from "@/components/ui/swipeReleaseIntent";
import { View } from "@/tw";

/** Snap do card: anda e para. Spring quica e ainda revela o vermelho no overshoot. */
const SNAP = { duration: 200, easing: Easing.out(Easing.cubic) };

function commitHaptic() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium, {
    required: true,
  });
}

function tapHaptic() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light, {
    required: true,
  });
}

export type SwipeToDeleteProps = {
  children: ReactNode;
  onDelete: () => void;
  accessibilityLabel: string;
  /** Precisa bater com o raio do card, senão o vermelho vaza nos cantos. */
  radius?: number;
};

export function SwipeToDelete({
  children,
  onDelete,
  accessibilityLabel,
  radius = 20,
}: SwipeToDeleteProps) {
  const translateX = useSharedValue(0);
  const startX = useSharedValue(0);
  const rowWidth = useSharedValue(0);
  const armed = useSharedValue(false);

  function fireDelete() {
    onDelete();
  }

  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-16, 16])
    .onBegin(() => {
      startX.value = translateX.value;
    })
    .onUpdate((e) => {
      const width = rowWidth.value;
      const min = width > 0 ? -width : -420;
      const next = startX.value + e.translationX;
      if (next > 0) {
        translateX.value = 0;
      } else if (next < min) {
        translateX.value = min + (next - min) * 0.12;
      } else {
        translateX.value = next;
      }

      if (width === 0) return;
      const threshold = width * COMMIT_RATIO;
      const revealed = -translateX.value;
      if (revealed >= threshold && !armed.value) {
        armed.value = true;
        runOnJS(commitHaptic)();
      } else if (revealed < threshold * 0.85 && armed.value) {
        armed.value = false;
      }
    })
    .onEnd((e) => {
      const width = Math.max(rowWidth.value, ACTION_WIDTH);
      const intent = swipeReleaseIntent(translateX.value, e.velocityX, width);
      if (intent === "delete") {
        translateX.value = withTiming(-width, { duration: 180 }, (done) => {
          if (done) runOnJS(fireDelete)();
        });
        return;
      }
      translateX.value = withTiming(
        intent === "open" ? -ACTION_WIDTH : 0,
        SNAP,
      );
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  // Vermelho só existe enquanto o card saiu do lugar. Sem isso o scale/toque
  // do filho abre um vão e o delete layer aparece atrás.
  const layerStyle = useAnimatedStyle(() => ({
    opacity: translateX.value < -1 ? 1 : 0,
  }));

  // Lixeira cola na borda direita do card: no botão compacto fica parada;
  // no commit, anda junto com o resto do vermelho.
  const iconStyle = useAnimatedStyle(() => {
    const revealed = Math.max(0, -translateX.value);
    return {
      transform: [{ translateX: Math.min(0, ACTION_WIDTH - revealed) }],
    };
  });

  return (
    <View
      style={{ borderRadius: radius, overflow: "hidden" }}
      onLayout={(e) => {
        rowWidth.value = e.nativeEvent.layout.width;
      }}
    >
      <Animated.View style={[styles.deleteLayer, layerStyle]}>
        <Animated.View style={[styles.iconWrap, iconStyle]}>
          <RNPressable
            onPress={() => {
              tapHaptic();
              onDelete();
            }}
            style={styles.trashHit}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
          >
            <Ionicons name="trash" size={22} color="#FFFFFF" />
          </RNPressable>
        </Animated.View>
      </Animated.View>

      <GestureDetector gesture={pan}>
        <Animated.View style={cardStyle}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  deleteLayer: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#FF3B30",
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "stretch",
  },
  iconWrap: {
    width: ACTION_WIDTH,
  },
  trashHit: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
