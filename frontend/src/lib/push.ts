// Registro do Expo Push Token. A permissão não é pedida no boot:
// o pré-prompt e o switch de Ajustes chamam enablePush().
// No Expo Go Android o import do módulo estoura (SDK 53+). Lá a gente nem carrega.

import Constants from "expo-constants";
import * as Device from "expo-device";
import { isRunningInExpoGo } from "expo";
import { requireOptionalNativeModule } from "expo-modules-core";
import { getCalendars } from "expo-localization";
import { Platform } from "react-native";

import { deletePushToken, registerPushToken } from "@/lib/api";
import { notificationHref } from "@/lib/notification-link";
import { usePreferencesStore } from "@/stores/preferencesStore";

const CHANNEL_ID = "roteiro";

type NotificationsModule = typeof import("expo-notifications");

let notificationsPromise: Promise<NotificationsModule | null> | null = null;

export function pushNativeAvailable(): boolean {
  if (Platform.OS === "web") return false;
  if (Platform.OS === "android" && isRunningInExpoGo()) return false;
  // Sem esse módulo o import de expo-notifications derruba o JS (dev client velho).
  if (!requireOptionalNativeModule("ExpoPushTokenManager")) return false;
  return true;
}

function loadNotifications(): Promise<NotificationsModule | null> {
  if (!pushNativeAvailable()) return Promise.resolve(null);
  if (!notificationsPromise) {
    notificationsPromise = import("expo-notifications")
      .then((mod) => {
        mod.setNotificationHandler({
          handleNotification: async () => ({
            shouldPlaySound: true,
            shouldSetBadge: false,
            shouldShowBanner: true,
            shouldShowList: true,
          }),
        });
        return mod;
      })
      .catch((err) => {
        console.warn("[push] módulo indisponível:", err);
        return null;
      });
  }
  return notificationsPromise;
}

function deviceTimezone(): string {
  const fromCalendar = getCalendars()[0]?.timeZone;
  if (fromCalendar) return fromCalendar;
  const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return resolved || "UTC";
}

function projectId(): string | null {
  const extra = Constants.expoConfig?.extra as
    | { eas?: { projectId?: string } }
    | undefined;
  const id = extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  return typeof id === "string" && id ? id : null;
}

function rememberToken(token: string | null) {
  usePreferencesStore.getState().setPushToken(token);
}

async function ensureAndroidChannel(
  notifications: NotificationsModule,
): Promise<void> {
  if (Platform.OS !== "android") return;
  await notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: "Roteiro",
    importance: notifications.AndroidImportance.HIGH,
    sound: "default",
  });
}

export async function readPushPermission(): Promise<
  "granted" | "denied" | "undetermined"
> {
  const notifications = await loadNotifications();
  if (!notifications) return "denied";
  try {
    const result = await notifications.getPermissionsAsync();
    if (result.status === "granted") return "granted";
    if (result.status === "denied") return "denied";
    return "undetermined";
  } catch (err) {
    console.warn("[push] permissão indisponível:", err);
    return "denied";
  }
}

async function registerCurrentDevice(
  notifications: NotificationsModule,
): Promise<boolean> {
  if (!Device.isDevice) return false;
  const id = projectId();
  if (!id) {
    console.warn("[push] projectId EAS ausente");
    return false;
  }
  await ensureAndroidChannel(notifications);
  const token = await notifications.getExpoPushTokenAsync({ projectId: id });
  const platform = Platform.OS === "ios" ? "ios" : "android";
  await registerPushToken({
    token: token.data,
    platform,
    timezone: deviceTimezone(),
  });
  rememberToken(token.data);
  return true;
}

export async function enablePush(): Promise<
  "granted" | "denied" | "unavailable"
> {
  const notifications = await loadNotifications();
  if (!notifications || !Device.isDevice) return "unavailable";
  try {
    // Canal antes do diálogo: sem ele o Android 8+ não mostra heads-up.
    await ensureAndroidChannel(notifications);
    const existing = await notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== "granted") {
      const asked = await notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: false, allowSound: true },
      });
      status = asked.status;
    }
    if (status !== "granted") {
      usePreferencesStore.getState().setPushOptIn(false);
      return "denied";
    }
    usePreferencesStore.getState().setPushOptIn(true);
    const ok = await registerCurrentDevice(notifications);
    if (!ok) usePreferencesStore.getState().setPushOptIn(false);
    return ok ? "granted" : "unavailable";
  } catch (err) {
    console.warn("[push] registro falhou:", err);
    usePreferencesStore.getState().setPushOptIn(false);
    return "unavailable";
  }
}

export async function disablePush(): Promise<void> {
  usePreferencesStore.getState().setPushOptIn(false);
  await unregisterCurrentPushToken();
}

export async function unregisterCurrentPushToken(): Promise<void> {
  const token = usePreferencesStore.getState().pushToken;
  rememberToken(null);
  if (!token) return;
  try {
    await deletePushToken(token);
  } catch (err) {
    console.warn("[push] remover token falhou:", err);
  }
}

export async function refreshPushTokenIfGranted(): Promise<void> {
  if (!usePreferencesStore.getState().pushOptIn) return;
  const notifications = await loadNotifications();
  if (!notifications || !Device.isDevice) return;
  try {
    const permission = await notifications.getPermissionsAsync();
    if (permission.status !== "granted") return;
    await registerCurrentDevice(notifications);
  } catch (err) {
    console.warn("[push] atualizar fuso falhou:", err);
  }
}

export async function maybeOfferNotificationPrompt(): Promise<void> {
  if (!Device.isDevice) return;
  const notifications = await loadNotifications();
  if (!notifications) return;
  const state = usePreferencesStore.getState();
  if (
    state.notificationPromptDismissed ||
    state.promptVisible ||
    state.pushOptIn
  ) {
    return;
  }
  try {
    const permission = await notifications.getPermissionsAsync();
    if (permission.status !== "undetermined") return;
    usePreferencesStore.getState().setPromptVisible(true);
  } catch (err) {
    console.warn("[push] pré-prompt indisponível:", err);
  }
}

export async function listenForNotificationOpens(
  onOpen: (id: string, href: string) => void,
): Promise<() => void> {
  const notifications = await loadNotifications();
  if (!notifications) return () => {};

  const accept = (
    response: {
      notification: {
        request: { identifier: string; content: { data?: unknown } };
      };
    } | null,
  ) => {
    if (!response) return;
    const data = response.notification.request.content.data;
    const href = notificationHref(
      data && typeof data === "object" ? (data as { url?: unknown }).url : null,
    );
    if (!href) return;
    onOpen(response.notification.request.identifier, href);
  };

  const subscription =
    notifications.addNotificationResponseReceivedListener(accept);
  void notifications
    .getLastNotificationResponseAsync()
    .then(accept)
    .catch((err) => {
      console.warn("[push] último toque indisponível:", err);
    });
  return () => subscription.remove();
}
