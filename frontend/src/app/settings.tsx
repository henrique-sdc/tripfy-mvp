// Configurações — conta, preferências do app e suporte (RF03).
// Zona de perigo (excluir conta) mora aqui, não em edit-profile: edit-profile
// foca em dados pessoais (foto/nome/bio); ações de conta ficam concentradas
// numa área própria de Configurações.

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { signOut } from "firebase/auth";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, useColorScheme } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText } from "@/components/ui/AppText";
import { Button } from "@/components/ui/Button";
import { useTheme } from "@/hooks/use-theme";
import { getAuthErrorKey } from "@/lib/auth-errors";
import { auth } from "@/lib/firebase";
import { deleteUserAccount } from "@/lib/profile";
import { useAuthStore } from "@/stores/authStore";
import { Pressable, ScrollView, View } from "@/tw";

function SettingsRow({
  icon,
  label,
  onPress,
  disabled,
  badge,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  badge?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={
        disabled
          ? undefined
          : () => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onPress?.();
            }
      }
      disabled={disabled}
      className="flex-row items-center gap-3 rounded-2xl border px-4 py-3.5"
      style={{
        backgroundColor: theme.surface,
        borderColor: theme.border,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <View
        className="w-9 h-9 rounded-full items-center justify-center"
        style={{ backgroundColor: `${theme.accent}18` }}
      >
        <Ionicons name={icon} size={18} color={theme.accent} />
      </View>
      <AppText className="flex-1 text-[15px] font-medium">{label}</AppText>
      {badge ? (
        <View
          className="rounded-full px-2.5 py-1"
          style={{ backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border }}
        >
          <AppText tone="muted" className="text-[11px] font-semibold">
            {badge}
          </AppText>
        </View>
      ) : (
        <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
      )}
    </Pressable>
  );
}

export default function SettingsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const scheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const setUser = useAuthStore((s) => s.setUser);
  const setHasPreferences = useAuthStore((s) => s.setHasPreferences);

  const [signingOut, setSigningOut] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function onAskSignOut() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(t("settings.signOutTitle"), t("settings.signOutBody"), [
      { text: t("settings.signOutCancel"), style: "cancel" },
      {
        text: t("settings.signOutConfirm"),
        style: "destructive",
        onPress: () => {
          void onSignOut();
        },
      },
    ]);
  }

  async function onSignOut() {
    setSigningOut(true);
    setFormError(null);
    try {
      await signOut(auth);
      // Limpa store na hora — onAuthStateChanged também reage, mas não
      // dependemos só dele pra não piscar estado intermediário.
      setUser(null);
      setHasPreferences(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      console.error("[settings] signOut:", err);
      setFormError(getAuthErrorKey(err));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSigningOut(false);
    }
  }

  function onAskDelete() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(t("editProfile.deleteTitle"), t("editProfile.deleteBody"), [
      { text: t("editProfile.deleteCancel"), style: "cancel" },
      {
        text: t("editProfile.deleteConfirm"),
        style: "destructive",
        onPress: () => {
          void onDeleteConfirmed();
        },
      },
    ]);
  }

  async function onDeleteConfirmed() {
    setDeleting(true);
    setFormError(null);
    try {
      await deleteUserAccount();
      setUser(null);
      setHasPreferences(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      console.error("[settings] delete:", err);
      const code = (err as { code?: string })?.code;
      setFormError(
        code === "auth/requires-recent-login"
          ? "editProfile.errors.requiresRecentLogin"
          : getAuthErrorKey(err),
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setDeleting(false);
    }
  }

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
          {t("settings.title")}
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
            {t("settings.accountSection")}
          </AppText>
          <SettingsRow
            icon="person-outline"
            label={t("settings.editProfile")}
            onPress={() => router.push("/edit-profile")}
          />
          <SettingsRow
            icon="sparkles-outline"
            label={t("settings.editVibe")}
            onPress={() => router.push("/edit-vibe")}
          />
          <SettingsRow
            icon="star-outline"
            label={t("settings.myReviews")}
            onPress={() => router.push("/my-reviews")}
          />
          <SettingsRow
            icon="trash-outline"
            label={t("settings.trash")}
            onPress={() => router.push("/trash")}
          />
        </View>

        <View className="gap-3">
          <AppText tone="secondary" className="text-[13px] font-semibold uppercase tracking-wide">
            {t("settings.appSection")}
          </AppText>
          <SettingsRow
            icon="notifications-outline"
            label={t("settings.notifications")}
            disabled
            badge={t("settings.comingSoon")}
          />
        </View>

        <View className="gap-3">
          <AppText tone="secondary" className="text-[13px] font-semibold uppercase tracking-wide">
            {t("settings.supportSection")}
          </AppText>
          <SettingsRow
            icon="help-circle-outline"
            label={t("settings.helpSupport")}
            onPress={() => router.push("/help-support")}
          />
        </View>

        {formError ? (
          <AppText
            className="text-[13px] text-center"
            style={{ color: theme.error }}
          >
            {t(formError)}
          </AppText>
        ) : null}

        <View className="gap-3">
          <AppText tone="secondary" className="text-[13px] font-semibold uppercase tracking-wide">
            {t("settings.sessionSection")}
          </AppText>
          <Button
            variant="secondary"
            onPress={onAskSignOut}
            loading={signingOut}
            disabled={signingOut || deleting}
          >
            {t("settings.signOut")}
          </Button>
        </View>

        <View
          className="mt-4 pt-6"
          style={{ borderTopWidth: 1, borderTopColor: theme.border }}
        >
          <AppText
            className="text-[13px] font-semibold mb-1"
            style={{ color: theme.error }}
          >
            {t("editProfile.dangerZone")}
          </AppText>
          <AppText tone="secondary" className="text-[12px] mb-4">
            {t("editProfile.dangerHint")}
          </AppText>
          <Button
            variant="ghost"
            onPress={onAskDelete}
            loading={deleting}
            disabled={signingOut || deleting}
          >
            <AppText className="font-bold text-[16px]" style={{ color: theme.error }}>
              {t("editProfile.deleteButton")}
            </AppText>
          </Button>
        </View>
      </ScrollView>
    </View>
  );
}
