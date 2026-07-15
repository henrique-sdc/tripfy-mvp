// Expansão da foto: morph do avatar → centro → volta.
// Origem em shared values (setados ANTES do Modal) pra não flashar em (0,0).
// Lápis no canto inferior direito, cortando a borda — igual à câmera do edit.

import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dimensions,
  Modal,
  Platform,
  Pressable as RNPressable,
  View as RNView,
  StyleSheet,
} from "react-native";
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { AppText } from "@/components/ui/AppText";
import { useTheme } from "@/hooks/use-theme";
import { Pressable } from "@/tw";

export const AVATAR_SIZE = 96;
const EXPANDED_SIZE = Math.min(Dimensions.get("window").width * 0.72, 280);
const BADGE_SIZE = 36; // w-9 — igual à câmera em edit-profile

const OPEN_MS = 280;
const CLOSE_MS = 200;
const EASE_OUT = Easing.out(Easing.cubic);
const IS_IOS = Platform.OS === "ios";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

type ProfilePhotoExpandProps = {
  photoUri: string | null;
  displayName: string;
  onEdit: () => void;
};

export function ProfilePhotoExpand({
  photoUri,
  displayName,
  onEdit,
}: ProfilePhotoExpandProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const avatarRef = useRef<RNView>(null);

  const [open, setOpen] = useState(false);

  // Origem no UI thread — evita 1º frame em (0,0) com bolinha branca.
  const progress = useSharedValue(0);
  const originX = useSharedValue(0);
  const originY = useSharedValue(0);
  const originSize = useSharedValue(AVATAR_SIZE);
  // 0 até onShow: foto invisível enquanto o Modal monta.
  const visible = useSharedValue(0);

  const { width: screenW, height: screenH } = Dimensions.get("window");
  const targetX = (screenW - EXPANDED_SIZE) / 2;
  const targetY = (screenH - EXPANDED_SIZE) / 2 - 16;

  const finishClose = useCallback(
    (then?: () => void) => {
      visible.value = 0;
      setOpen(false);
      progress.value = 0;
      then?.();
    },
    [progress, visible],
  );

  function measureAvatar(cb: (x: number, y: number, size: number) => void) {
    avatarRef.current?.measureInWindow((x, y, w) => {
      cb(x, y, w);
    });
  }

  function openExpand() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // No Android o padrão é a foto surgir no centro: evita depender de
    // measureInWindow, que pode devolver coordenadas incorretas no primeiro
    // frame de um Modal fullscreen em alguns aparelhos.
    if (!IS_IOS) {
      progress.value = 0;
      visible.value = 0;
      setOpen(true);
      return;
    }

    measureAvatar((x, y, size) => {
      originX.value = x;
      originY.value = y;
      originSize.value = size;
      progress.value = 0;
      visible.value = 0;
      setOpen(true);
    });
  }

  function onModalShow() {
    // Modal já está na tela com origem correta — libera e anima.
    visible.value = 1;
    progress.value = withTiming(1, { duration: OPEN_MS, easing: EASE_OUT });
  }

  function closeExpand(then?: () => void) {
    if (!IS_IOS) {
      progress.value = withTiming(
        0,
        { duration: CLOSE_MS, easing: EASE_OUT },
        (finished) => {
          if (finished) runOnJS(finishClose)(then);
        },
      );
      return;
    }

    // Remede a posição atual (scroll etc.) pra voltar no lugar certo.
    measureAvatar((x, y, size) => {
      originX.value = x;
      originY.value = y;
      originSize.value = size;
      progress.value = withTiming(
        0,
        { duration: CLOSE_MS, easing: EASE_OUT },
        (finished) => {
          if (finished) runOnJS(finishClose)(then);
        },
      );
    });
  }

  function onBackdropPress() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    closeExpand();
  }

  function onPencilPress() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    closeExpand(onEdit);
  }

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));

  const photoWrapStyle = useAnimatedStyle(() => {
    if (!IS_IOS) {
      return {
        position: "absolute" as const,
        left: targetX,
        top: targetY,
        width: EXPANDED_SIZE,
        height: EXPANDED_SIZE,
        opacity: progress.value,
        transform: [
          {
            scale: interpolate(progress.value, [0, 1], [0.92, 1]),
          },
        ],
      };
    }

    const size = interpolate(
      progress.value,
      [0, 1],
      [originSize.value, EXPANDED_SIZE],
    );
    return {
      position: "absolute" as const,
      left: interpolate(progress.value, [0, 1], [originX.value, targetX]),
      top: interpolate(progress.value, [0, 1], [originY.value, targetY]),
      width: size,
      height: size,
      opacity: visible.value,
    };
  });

  // Lápis só no final — e acompanha o canto da foto (overflow visível).
  const badgeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.7, 1], [0, 1], "clamp"),
    transform: [
      {
        scale: interpolate(progress.value, [0.7, 1], [0.85, 1], "clamp"),
      },
    ],
  }));

  return (
    <>
      <Pressable
        onPress={openExpand}
        accessibilityLabel={t("profile.expandPhoto")}
      >
        <RNView
          ref={avatarRef}
          collapsable={false}
          style={{
            width: AVATAR_SIZE,
            height: AVATAR_SIZE,
            borderRadius: AVATAR_SIZE / 2,
            overflow: "hidden",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: theme.surface,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: theme.border,
          }}
        >
          {photoUri ? (
            <Image
              source={{ uri: photoUri }}
              style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}
              contentFit="cover"
            />
          ) : (
            <AppText className="text-[28px] font-bold" tone="secondary">
              {initials(displayName)}
            </AppText>
          )}
        </RNView>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="none"
        statusBarTranslucent
        onShow={onModalShow}
        onRequestClose={() => closeExpand()}
      >
        <RNView style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
            <RNPressable
              style={StyleSheet.absoluteFill}
              onPress={onBackdropPress}
              accessibilityLabel={t("profile.dismissPhoto")}
            >
              {Platform.OS === "ios" ? (
                <BlurView
                  intensity={45}
                  tint="dark"
                  style={StyleSheet.absoluteFill}
                />
              ) : null}
              <RNView
                pointerEvents="none"
                style={[
                  StyleSheet.absoluteFill,
                  {
                    backgroundColor:
                      Platform.OS === "ios"
                        ? "rgba(0,0,0,0.35)"
                        : "rgba(0,0,0,0.72)",
                  },
                ]}
              />
            </RNPressable>
          </Animated.View>

          {/* Morph: tamanho/posição do avatar → centro. overflow visível pro badge. */}
          <Animated.View style={photoWrapStyle} pointerEvents="box-none">
            <RNView
              style={[
                styles.photoCircle,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                },
              ]}
            >
              {photoUri ? (
                <Image
                  source={{ uri: photoUri }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                />
              ) : (
                <RNView style={styles.initialsBox}>
                  <AppText className="text-[48px] font-bold" tone="secondary">
                    {initials(displayName)}
                  </AppText>
                </RNView>
              )}
            </RNView>

            {/* Igual à câmera do edit: absolute bottom-0 right-0, corta a borda. */}
            <Animated.View style={[styles.badge, badgeStyle]}>
              <RNPressable
                onPress={onPencilPress}
                hitSlop={8}
                accessibilityLabel={t("profile.editPhoto")}
                style={[
                  styles.badgeBtn,
                  {
                    backgroundColor: theme.buttonPrimary,
                    // Mesmo anel que a câmera da tela de edição.
                    borderColor: theme.background,
                  },
                ]}
              >
                <Ionicons name="pencil" size={18} color={theme.buttonText} />
              </RNPressable>
            </Animated.View>
          </Animated.View>
        </RNView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  photoCircle: {
    ...StyleSheet.absoluteFill,
    borderRadius: 9999,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
  },
  initialsBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    right: 0,
    bottom: 0,
    zIndex: 2,
  },
  badgeBtn: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#ffffff",
  },
});
