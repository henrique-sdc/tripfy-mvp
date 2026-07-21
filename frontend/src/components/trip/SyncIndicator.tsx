// Indicador de sync no header — nuvem + spinner / check (Apple + Emil).
// Troca de estado com fade curto; nunca ease-in; respeita reduced motion.

import { Ionicons } from "@expo/vector-icons";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useReducedMotion,
} from "react-native-reanimated";

import { AppText } from "@/components/ui/AppText";
import { useTheme } from "@/hooks/use-theme";

export type SyncStatus = "saving" | "saved" | "error";

type Props = {
  status: SyncStatus;
};

const ENTER = FadeIn.duration(180).easing(Easing.out(Easing.cubic));
const EXIT = FadeOut.duration(140).easing(Easing.out(Easing.quad));

export function SyncIndicator({ status }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (status === "error") {
      console.warn("[SyncIndicator] Falha ao sincronizar viagem com o Firestore");
    }
  }, [status]);

  const label =
    status === "saving"
      ? t("tripDetail.sync.saving")
      : status === "error"
        ? t("tripDetail.sync.error")
        : t("tripDetail.sync.saved");

  const iconColor =
    status === "saved"
      ? "#34C759"
      : status === "error"
        ? theme.error
        : theme.textSecondary;

  return (
    <View
      style={styles.wrap}
      accessibilityRole="text"
      accessibilityLabel={label}
    >
      <Animated.View
        key={status}
        entering={reduceMotion ? undefined : ENTER}
        exiting={reduceMotion ? undefined : EXIT}
        style={styles.row}
      >
        {status === "saving" ? (
          <ActivityIndicator size="small" color={theme.textSecondary} />
        ) : (
          <Ionicons
            name={status === "saved" ? "cloud-done" : "cloud-offline"}
            size={18}
            color={iconColor}
          />
        )}
        <AppText
          tone={
            status === "saved"
              ? "success"
              : status === "error"
                ? "error"
                : "secondary"
          }
          className="text-[11px] font-semibold"
        >
          {label}
        </AppText>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    minWidth: 64,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
});
