// Ajuda & Suporte — FAQ curto, contato e direitos LGPD (RN01/RF03).
// Sem Política de Privacidade/Termos completos ainda — só o aviso "em breve".

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import { Linking, useColorScheme } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText } from "@/components/ui/AppText";
import { useTheme } from "@/hooks/use-theme";
import { Pressable, ScrollView, View } from "@/tw";

const SUPPORT_EMAIL = "suporte@tripfy.app";
const FAQ_KEYS = ["ai", "match", "cost", "dataSafety", "deleteData"] as const;

export default function HelpSupportScreen() {
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
            router.back();
          }}
          hitSlop={12}
          className="w-10 h-10 rounded-full items-center justify-center mr-2"
          style={{ backgroundColor: theme.surface }}
          accessibilityLabel={t("editProfile.back")}
        >
          <Ionicons name="chevron-back" size={22} color={theme.textPrimary} />
        </Pressable>
        <AppText className="text-[20px] font-bold flex-1">
          {t("helpSupport.title")}
        </AppText>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingBottom: insets.bottom + 32,
          gap: 28,
        }}
      >
        <View className="gap-3">
          <AppText tone="secondary" className="text-[13px] font-semibold uppercase tracking-wide">
            {t("helpSupport.faqSection")}
          </AppText>
          {FAQ_KEYS.map((key) => (
            <View
              key={key}
              className="rounded-2xl border p-4 gap-1.5"
              style={{ backgroundColor: theme.surface, borderColor: theme.border }}
            >
              <AppText className="text-[14px] font-semibold">
                {t(`helpSupport.faq.${key}.q`)}
              </AppText>
              <AppText tone="secondary" className="text-[13px] leading-5">
                {t(`helpSupport.faq.${key}.a`)}
              </AppText>
            </View>
          ))}
        </View>

        <View
          className="rounded-2xl border p-4 gap-2"
          style={{ backgroundColor: theme.surface, borderColor: theme.border }}
        >
          <AppText className="text-[14px] font-semibold">
            {t("helpSupport.lgpd.title")}
          </AppText>
          <AppText tone="secondary" className="text-[13px] leading-5">
            {t("helpSupport.lgpd.body")}
          </AppText>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/settings");
            }}
            hitSlop={8}
            className="mt-1"
          >
            <AppText tone="accent" className="text-[13px] font-semibold">
              {t("helpSupport.lgpd.deleteLink")}
            </AppText>
          </Pressable>
        </View>

        <View className="gap-3">
          <AppText tone="secondary" className="text-[13px] font-semibold uppercase tracking-wide">
            {t("helpSupport.contactSection")}
          </AppText>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              Linking.openURL(`mailto:${SUPPORT_EMAIL}`);
            }}
            className="flex-row items-center gap-3 rounded-2xl border px-4 py-3.5"
            style={{ backgroundColor: theme.surface, borderColor: theme.border }}
          >
            <View
              className="w-9 h-9 rounded-full items-center justify-center"
              style={{ backgroundColor: `${theme.accent}18` }}
            >
              <Ionicons name="mail-outline" size={18} color={theme.accent} />
            </View>
            <AppText className="flex-1 text-[15px] font-medium">
              {SUPPORT_EMAIL}
            </AppText>
            <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
          </Pressable>
        </View>

        <AppText tone="muted" className="text-[12px] text-center leading-5">
          {t("helpSupport.legalComingSoon")}
        </AppText>
      </ScrollView>
    </View>
  );
}
