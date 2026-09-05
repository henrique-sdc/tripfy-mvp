// Banner de Match — arrasta pra esquerda pra dispensar.
// O gesto todo vive no SwipeToDelete, o mesmo usado em Viagens e na Lixeira.

import * as Haptics from "@/lib/haptics";
import { useTranslation } from "react-i18next";

import { AppText } from "@/components/ui/AppText";
import { SwipeToDelete } from "@/components/ui/SwipeToDelete";
import { useTheme } from "@/hooks/use-theme";
import { Pressable, View } from "@/tw";

type InviteBannerProps = {
  destination: string;
  onAccept?: () => void;
  onDismiss?: () => void;
};

export function InviteBanner({
  destination,
  onAccept,
  onDismiss,
}: InviteBannerProps) {
  const { t } = useTranslation();
  const theme = useTheme();

  return (
    <SwipeToDelete
      radius={16}
      accessibilityLabel={t("home.pending.dismissA11y")}
      onDelete={() => onDismiss?.()}
    >
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onAccept?.();
        }}
        className="flex-row items-center gap-3 px-4 py-4 rounded-2xl border"
        // Fundo opaco: é ele que esconde o vermelho da ação em repouso.
        style={{ backgroundColor: theme.surface, borderColor: theme.accent }}
      >
        <View
          className="w-11 h-11 rounded-full items-center justify-center"
          style={{ backgroundColor: `${theme.accent}22` }}
        >
          <AppText className="text-[20px]">✈️</AppText>
        </View>

        <View className="flex-1 gap-1">
          <AppText className="text-[14px] font-medium leading-5">
            {t("home.pending.message", { destination })}
          </AppText>
          <AppText tone="accent" className="text-[13px] font-bold">
            {t("home.pending.cta")}
          </AppText>
        </View>
      </Pressable>
    </SwipeToDelete>
  );
}
