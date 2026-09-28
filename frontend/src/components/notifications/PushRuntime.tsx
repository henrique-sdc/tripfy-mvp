// Listener único do toque (app vivo ou morto) e o pré-prompt de permissão.
// A URL do payload é path do Expo Router: /trip-detail ou /help-support.

import { router, type Href } from "expo-router";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { AppState, Modal, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText } from "@/components/ui/AppText";
import { useTheme } from "@/hooks/use-theme";
import {
  enablePush,
  listenForNotificationOpens,
  pushNativeAvailable,
  refreshPushTokenIfGranted,
} from "@/lib/push";
import * as Haptics from "@/lib/haptics";
import { selectIsAuthenticated, useAuthStore } from "@/stores/authStore";
import { usePreferencesStore } from "@/stores/preferencesStore";
import { Pressable, View } from "@/tw";

let pendingHref: string | null = null;
let pendingId: string | null = null;
// Listener e getLastNotificationResponseAsync disparam o mesmo toque.
const seenNotificationIds = new Set<string>();

function openNotification(id: string, href: string) {
  usePreferencesStore.getState().setHandledNotificationId(id);
  router.push(href as Href);
}

export function PushRuntime() {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const hasPreferences = useAuthStore((s) => s.hasPreferences);
  const ready = isAuthenticated && hasPreferences === true;
  const readyRef = useRef(ready);
  useEffect(() => {
    readyRef.current = ready;
  }, [ready]);

  const promptVisible = usePreferencesStore((s) => s.promptVisible);
  const dismiss = usePreferencesStore((s) => s.dismissNotificationPrompt);

  useEffect(() => {
    if (Platform.OS === "web" || !pushNativeAvailable()) return;
    let unsubscribe = () => {};
    let cancelled = false;

    void listenForNotificationOpens((id, href) => {
      if (
        seenNotificationIds.has(id) ||
        usePreferencesStore.getState().handledNotificationId === id
      ) {
        return;
      }
      seenNotificationIds.add(id);
      if (!readyRef.current) {
        pendingHref = href;
        pendingId = id;
        return;
      }
      openNotification(id, href);
    }).then((remove) => {
      if (cancelled) {
        remove();
        return;
      }
      unsubscribe = remove;
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!ready || !pendingHref || !pendingId) return;
    const href = pendingHref;
    const id = pendingId;
    pendingHref = null;
    pendingId = null;
    openNotification(id, href);
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    void refreshPushTokenIfGranted();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refreshPushTokenIfGranted();
    });
    return () => subscription.remove();
  }, [ready]);

  return (
    <Modal
      visible={promptVisible}
      transparent
      animationType="fade"
      onRequestClose={dismiss}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View
        className="flex-1 justify-end"
        style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
      >
        <Pressable
          onPress={dismiss}
          accessibilityRole="button"
          accessibilityLabel={t("pushPrompt.later")}
          style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
        />
        <View
          className="mx-4 rounded-3xl border px-5 pt-5 gap-4"
          style={{
            backgroundColor: theme.surface,
            borderColor: theme.border,
            marginBottom: Math.max(insets.bottom, 16),
            zIndex: 1,
          }}
        >
          <View className="gap-1.5">
            <AppText className="text-[18px] font-semibold">
              {t("pushPrompt.title")}
            </AppText>
            <AppText tone="secondary" className="text-[14px] leading-5">
              {t("pushPrompt.body")}
            </AppText>
          </View>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              usePreferencesStore.getState().setPromptVisible(false);
              void enablePush();
            }}
            accessibilityRole="button"
            className="h-12 rounded-full items-center justify-center"
            style={{ backgroundColor: theme.buttonPrimary }}
          >
            <AppText
              className="text-[15px] font-semibold"
              style={{ color: theme.buttonText }}
            >
              {t("pushPrompt.enable")}
            </AppText>
          </Pressable>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              dismiss();
            }}
            accessibilityRole="button"
            className="h-11 items-center justify-center"
            style={{ marginBottom: 8 }}
          >
            <AppText tone="secondary" className="text-[15px] font-semibold">
              {t("pushPrompt.later")}
            </AppText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
