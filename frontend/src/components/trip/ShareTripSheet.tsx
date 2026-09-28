// Três jeitos de soltar o roteiro: editar junto, cópia, Explorar.
// Física igual ao NearbySuggestionsSheet: sobe em 240 ms, fecha mais rápido.

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Modal,
  Pressable,
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
import { useTheme } from "@/hooks/use-theme";

const ENTER = { duration: 240, easing: Easing.out(Easing.cubic) };
const DISMISS_MS = 180;
const DISMISS_Y = 100;

type RowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  disabled?: boolean;
  busy?: boolean;
  onPress: () => void;
};

function ShareRow({ icon, title, body, disabled, busy, onPress }: RowProps) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => {
        if (disabled || busy) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      disabled={disabled || busy}
      style={[styles.row, disabled ? { opacity: 0.45 } : null]}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled || busy), busy }}
    >
      <View style={[styles.icon, { backgroundColor: theme.surface }]}>
        {busy ? (
          <ActivityIndicator size="small" color={theme.accent} />
        ) : (
          <Ionicons name={icon} size={18} color={theme.accent} />
        )}
      </View>
      <View style={styles.rowText}>
        <AppText className="text-[15px] font-semibold">{title}</AppText>
        <AppText tone="secondary" className="text-[13px]">
          {body}
        </AppText>
      </View>
    </Pressable>
  );
}

type Props = {
  visible: boolean;
  roomFull: boolean;
  isPublic: boolean;
  inviting: boolean;
  publishing: boolean;
  onClose: () => void;
  onInvite: () => void;
  onShareCopy: () => void;
  onTogglePublish: () => void;
};

export function ShareTripSheet({
  visible,
  roomFull,
  isPublic,
  inviting,
  publishing,
  onClose,
  onInvite,
  onShareCopy,
  onTogglePublish,
}: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const translateY = useSharedValue(400);
  const backdrop = useSharedValue(0);

  function dismiss() {
    if (reduceMotion) {
      onClose();
      return;
    }
    backdrop.value = withTiming(0, { duration: DISMISS_MS });
    translateY.value = withTiming(400, { duration: DISMISS_MS }, (finished) => {
      if (finished) runOnJS(onClose)();
    });
  }

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

  const pan = Gesture.Pan()
    .onUpdate((event) => {
      if (event.translationY > 0) translateY.value = event.translationY;
    })
    .onEnd((event) => {
      if (event.translationY > DISMISS_Y || event.velocityY > 800) {
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

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={dismiss}
      statusBarTranslucent
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
                  style={[styles.handle, { backgroundColor: theme.border }]}
                />
              </View>
              <View style={styles.header}>
                <AppText className="text-[17px] font-semibold">
                  {t("tripDetail.shareSheet.title")}
                </AppText>
              </View>
              <ShareRow
                icon="people-outline"
                title={t("tripDetail.shareSheet.inviteTitle")}
                body={
                  roomFull
                    ? t("tripDetail.shareSheet.inviteFull")
                    : t("tripDetail.shareSheet.inviteBody")
                }
                disabled={roomFull}
                busy={inviting}
                onPress={onInvite}
              />
              <ShareRow
                icon="copy-outline"
                title={t("tripDetail.shareSheet.copyTitle")}
                body={t("tripDetail.shareSheet.copyBody")}
                onPress={onShareCopy}
              />
              <ShareRow
                icon={isPublic ? "eye-off-outline" : "earth-outline"}
                title={
                  isPublic
                    ? t("tripDetail.shareSheet.unpublishTitle")
                    : t("tripDetail.shareSheet.publishTitle")
                }
                body={
                  isPublic
                    ? t("tripDetail.shareSheet.unpublishBody")
                    : t("tripDetail.shareSheet.publishBody")
                }
                busy={publishing}
                onPress={onTogglePublish}
              />
              <Pressable
                onPress={dismiss}
                style={styles.close}
                accessibilityLabel={t("tripDetail.close")}
              >
                <Ionicons name="close" size={18} color={theme.textSecondary} />
              </Pressable>
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
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 6,
  },
  handleHit: { alignItems: "center", paddingVertical: 8 },
  handle: { width: 36, height: 5, borderRadius: 3 },
  header: { paddingHorizontal: 20, paddingRight: 44, paddingBottom: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: { flex: 1, gap: 2 },
  close: { position: "absolute", top: 14, right: 16, padding: 6 },
});
