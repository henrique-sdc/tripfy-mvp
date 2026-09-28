// Deep link /join/{token} — aceite da sala. O id da viagem não basta.

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, useColorScheme } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText } from "@/components/ui/AppText";
import { useTheme } from "@/hooks/use-theme";
import {
  acceptTripInviteApi,
  ApiError,
  previewTripInviteApi,
  type TripInvitePreview,
} from "@/lib/api";
import { Pressable, View } from "@/tw";

type JoinError = "missing" | "full" | "generic";

export default function JoinTripScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const scheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ token: string }>();
  const token = typeof params.token === "string" ? params.token.trim() : "";

  const [preview, setPreview] = useState<TripInvitePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<JoinError | null>(null);

  useEffect(() => {
    if (!token) {
      setError("missing");
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    void previewTripInviteApi(token, controller.signal)
      .then((data) => {
        if (!cancelled) setPreview(data);
      })
      .catch((err: unknown) => {
        if (cancelled || controller.signal.aborted) return;
        const status = err instanceof ApiError ? err.status : 0;
        console.warn("[join] preview:", status || "falha");
        setError(status === 404 ? "missing" : "generic");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [token]);

  function leave() {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)" as Href);
  }

  async function accept() {
    if (!preview || accepting) return;
    setAccepting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await acceptTripInviteApi(preview.trip_id, token);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace({
        pathname: "/trip-detail",
        params: { tripId: preview.trip_id },
      } as Href);
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      const code = err instanceof ApiError ? err.code : undefined;
      console.warn("[join] aceite:", status || "falha");
      setError(code === "trip_full" ? "full" : status === 404 ? "missing" : "generic");
      setAccepting(false);
    }
  }

  const who = preview?.owner_name.trim() || t("tripDetail.presence.someone");
  const place =
    preview?.title.trim() ||
    preview?.destination.trim() ||
    t("tripDetail.fallbackTitle");

  return (
    <View className="flex-1 px-6" style={{ backgroundColor: theme.background }}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <View style={{ paddingTop: insets.top + 8 }}>
        <Pressable
          onPress={leave}
          hitSlop={12}
          className="w-10 h-10 rounded-full items-center justify-center"
          style={{ backgroundColor: theme.surface }}
          accessibilityLabel={t("wizard.close")}
        >
          <Ionicons name="chevron-back" size={22} color={theme.textPrimary} />
        </Pressable>
      </View>

      <View className="flex-1 justify-center gap-3">
        {loading ? (
          <ActivityIndicator color={theme.accent} />
        ) : error || !preview ? (
          <AppText className="text-[22px] font-bold">
            {t(`tripDetail.join.errors.${error ?? "missing"}`)}
          </AppText>
        ) : (
          <>
            <AppText className="text-[28px] font-bold">
              {t("tripDetail.join.title", { name: who })}
            </AppText>
            <AppText tone="secondary" className="text-[16px]">
              {t("tripDetail.join.body", {
                name: who,
                destination: place,
                count: preview.day_count,
              })}
            </AppText>
          </>
        )}
      </View>

      {!loading && preview && !error ? (
        <Pressable
          onPress={() => void accept()}
          disabled={accepting}
          className="h-14 rounded-2xl items-center justify-center mb-2"
          style={{
            backgroundColor: theme.buttonPrimary,
            marginBottom: Math.max(insets.bottom, 16),
            opacity: accepting ? 0.6 : 1,
          }}
          accessibilityRole="button"
        >
          {accepting ? (
            <ActivityIndicator color={theme.buttonText} />
          ) : (
            <AppText
              className="text-[16px] font-semibold"
              style={{ color: theme.buttonText }}
            >
              {preview.already_member
                ? t("tripDetail.join.open")
                : t("tripDetail.join.accept")}
            </AppText>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}
