// Texto curto de Termos ou Privacidade. O cadastro abre em modal; a Ajuda em rota.

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import { useColorScheme } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText } from "@/components/ui/AppText";
import { useTheme } from "@/hooks/use-theme";
import { Pressable, ScrollView, View } from "@/tw";

const PARAGRAPHS = {
  terms: ["p1", "p2", "p3", "p4"],
  privacy: ["p1", "p2", "p3", "p4"],
} as const;

export type LegalDoc = keyof typeof PARAGRAPHS;

export function LegalDocument({
  doc,
  onClose,
}: {
  doc: LegalDoc;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const scheme = useColorScheme();
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1" style={{ backgroundColor: theme.background }}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <View
        className="flex-row items-center px-6"
        style={{ paddingTop: insets.top + 8, paddingBottom: 8 }}
      >
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onClose();
          }}
          hitSlop={12}
          className="w-10 h-10 rounded-full items-center justify-center mr-2"
          style={{ backgroundColor: theme.surface }}
          accessibilityLabel={t("editProfile.back")}
        >
          <Ionicons name="chevron-back" size={22} color={theme.textPrimary} />
        </Pressable>
        <AppText className="text-[20px] font-bold flex-1">
          {t(`legal.${doc}Title`)}
        </AppText>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingTop: 8,
          paddingBottom: insets.bottom + 32,
          gap: 16,
        }}
      >
        {PARAGRAPHS[doc].map((key) => (
          <AppText
            key={key}
            selectable
            tone="secondary"
            className="text-[15px] leading-6"
          >
            {t(`legal.${doc}.${key}`)}
          </AppText>
        ))}
        <AppText tone="muted" className="text-[12px] leading-5 pt-2">
          {t("legal.updated")}
        </AppText>
      </ScrollView>
    </View>
  );
}
