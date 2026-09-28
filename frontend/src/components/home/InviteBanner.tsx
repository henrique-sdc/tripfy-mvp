// Convite de Match no topo da Home. Sem swipe: o recorte do gesto
// comia o raio e a borda do card.

import { Image } from "expo-image";
import * as Haptics from "@/lib/haptics";
import { useTranslation } from "react-i18next";
import { ActivityIndicator } from "react-native";

import { AppText } from "@/components/ui/AppText";
import { useTheme } from "@/hooks/use-theme";
import { Pressable, View } from "@/tw";

type InviteBannerProps = {
  name: string;
  destination: string;
  photoUri: string | null;
  accepting?: boolean;
  onAccept: () => void;
  onDecline: () => void;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

export function InviteBanner({
  name,
  destination,
  photoUri,
  accepting = false,
  onAccept,
  onDecline,
}: InviteBannerProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const label = name.trim() || t("profile.fallbackName");

  return (
    <View
      className="flex-row items-center gap-3 rounded-2xl border px-4 py-3.5"
      style={{ backgroundColor: theme.surface, borderColor: theme.border }}
    >
      {photoUri ? (
        <Image
          source={{ uri: photoUri }}
          style={{ width: 44, height: 44, borderRadius: 22 }}
          contentFit="cover"
        />
      ) : (
        <View
          className="w-11 h-11 rounded-full items-center justify-center"
          style={{ backgroundColor: `${theme.accent}22` }}
        >
          <AppText tone="accent" className="text-[14px] font-bold">
            {initials(label)}
          </AppText>
        </View>
      )}

      <View className="flex-1 gap-2">
        <AppText className="text-[14px] font-medium leading-5">
          {t("home.invite.message", { name: label, destination })}
        </AppText>
        <View className="flex-row items-center gap-4">
          <Pressable
            onPress={() => {
              if (accepting) return;
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onAccept();
            }}
            disabled={accepting}
            accessibilityRole="button"
            accessibilityLabel={t("home.invite.accept")}
          >
            {accepting ? (
              <ActivityIndicator color={theme.accent} />
            ) : (
              <AppText tone="accent" className="text-[14px] font-bold">
                {t("home.invite.accept")}
              </AppText>
            )}
          </Pressable>
          <Pressable
            onPress={() => {
              if (accepting) return;
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onDecline();
            }}
            disabled={accepting}
            accessibilityRole="button"
            accessibilityLabel={t("home.invite.dismissA11y")}
          >
            <AppText tone="secondary" className="text-[14px] font-semibold">
              {t("home.invite.decline")}
            </AppText>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
