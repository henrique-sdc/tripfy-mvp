// Perfil público via deep link tripfy://profile/{uid}.
// Read-only + CTA "Adicionar aos Companheiros" (proxy FastAPI / LGPD).

import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Haptics from "@/lib/haptics";
import { router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, useColorScheme } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText } from "@/components/ui/AppText";
import { INTERESTS, PACE_OPTIONS } from "@/constants/travel-preferences";
import { useTheme } from "@/hooks/use-theme";
import {
  addCompanion,
  ApiError,
  getMatch,
  getPublicProfile,
  listMyCompanions,
  NetworkError,
  type UserPublicProfile,
} from "@/lib/api";
import { auth } from "@/lib/firebase";
import { profilePhotoUri } from "@/lib/profile";
import { Pressable, ScrollView, View } from "@/tw";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function PublicProfileScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const scheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const targetUid = typeof id === "string" ? id.trim() : "";
  const myUid = auth.currentUser?.uid ?? null;
  const isOwn = Boolean(myUid && targetUid && myUid === targetUid);

  const [profile, setProfile] = useState<UserPublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [alreadyCompanion, setAlreadyCompanion] = useState(false);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    if (!targetUid) {
      setErrorKey("publicProfile.errors.notFound");
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorKey(null);
    try {
      const [remote, mine] = await Promise.all([
        getPublicProfile(targetUid),
        isOwn
          ? Promise.resolve([] as UserPublicProfile[])
          : listMyCompanions().catch(() => [] as UserPublicProfile[]),
      ]);
      setProfile(remote);
      setAlreadyCompanion(mine.some((c) => c.uid === targetUid));
    } catch (error) {
      console.error("[publicProfile] load:", error);
      // Deep link antigo `tripfy://match/ID` caía aqui com o ID da sala.
      if (error instanceof ApiError && error.status === 404) {
        try {
          await getMatch(targetUid);
          router.replace(`/match/${targetUid}`);
          return;
        } catch {
          setErrorKey("publicProfile.errors.notFound");
        }
      } else if (error instanceof NetworkError) {
        setErrorKey("common.networkError");
      } else {
        setErrorKey("publicProfile.errors.loadFailed");
      }
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [targetUid, isOwn]);

  useEffect(() => {
    void load();
  }, [load]);

  const displayName =
    profile?.name?.trim() || t("profile.fallbackName");
  const photoUri = profile
    ? profilePhotoUri({ photoBase64: profile.photoBase64 })
    : null;

  const vibeChips = useMemo(() => {
    if (!profile) return [];
    const chips: { key: string; label: string }[] = [];
    for (const value of profile.interests) {
      const meta = INTERESTS.find((i) => i.value === value);
      if (!meta) continue;
      chips.push({
        key: `interest-${value}`,
        label: `${meta.emoji} ${t(meta.labelKey)}`,
      });
    }
    if (profile.pace) {
      const paceMeta = PACE_OPTIONS.find((p) => p.value === profile.pace);
      if (paceMeta) {
        chips.push({
          key: `pace-${profile.pace}`,
          label: `${paceMeta.emoji} ${t(paceMeta.titleKey)}`,
        });
      }
    }
    return chips;
  }, [profile, t]);

  async function onAddCompanion() {
    if (!targetUid || adding || alreadyCompanion || isOwn) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setAdding(true);
    try {
      await addCompanion(targetUid);
      setAlreadyCompanion(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Fecha o perfil do amigo — a lista de companheiros no perfil já reflete no foco.
      if (router.canGoBack()) router.back();
      else router.replace("/(tabs)/profile");
    } catch (error) {
      console.error("[publicProfile] add:", error);
      setErrorKey("publicProfile.errors.addFailed");
      setAdding(false);
    }
  }

  const ctaDisabled = isOwn || alreadyCompanion || adding || !profile;
  const ctaLabel = isOwn
    ? t("publicProfile.ownProfile")
    : alreadyCompanion
      ? t("publicProfile.alreadyCompanion")
      : t("publicProfile.addCompanion");

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
            if (router.canGoBack()) router.back();
            else router.replace("/(tabs)/profile");
          }}
          hitSlop={12}
          className="w-10 h-10 rounded-full items-center justify-center mr-2"
          style={{ backgroundColor: theme.surface }}
          accessibilityLabel={t("editProfile.back")}
        >
          <Ionicons name="chevron-back" size={22} color={theme.textPrimary} />
        </Pressable>
        <AppText className="text-[20px] font-bold flex-1">
          {t("publicProfile.title")}
        </AppText>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={theme.accent} />
        </View>
      ) : errorKey && !profile ? (
        <View className="flex-1 items-center justify-center px-8 gap-3">
          <AppText className="text-[16px] font-semibold text-center">
            {t(errorKey)}
          </AppText>
          <Pressable
            onPress={() => void load()}
            className="rounded-xl px-5 py-3"
            style={{ backgroundColor: theme.buttonPrimary }}
          >
            <AppText
              className="text-[14px] font-semibold"
              style={{ color: theme.buttonText }}
            >
              {t("common.retry")}
            </AppText>
          </Pressable>
        </View>
      ) : profile ? (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingBottom: insets.bottom + 32,
          }}
        >
          <View className="items-center gap-2 mb-6 mt-2">
            {photoUri ? (
              <Image
                source={{ uri: photoUri }}
                style={{ width: 96, height: 96, borderRadius: 48 }}
                contentFit="cover"
              />
            ) : (
              <View
                className="w-24 h-24 rounded-full items-center justify-center"
                style={{ backgroundColor: `${theme.accent}22` }}
              >
                <AppText tone="accent" className="text-[28px] font-bold">
                  {initials(displayName)}
                </AppText>
              </View>
            )}
            <AppText
              className="text-[24px] font-bold"
              style={{ letterSpacing: -0.4 }}
            >
              {displayName}
            </AppText>
            {profile.bio.trim() ? (
              <AppText
                tone="secondary"
                className="text-[14px] text-center px-4"
              >
                {profile.bio.trim()}
              </AppText>
            ) : null}
          </View>

          <View className="gap-3 mb-8">
            <AppText className="text-[18px] font-bold">
              {t("publicProfile.vibeTitle")}
            </AppText>
            <View className="flex-row flex-wrap gap-2">
              {vibeChips.length > 0 ? (
                vibeChips.map((chip) => (
                  <View
                    key={chip.key}
                    className="rounded-full px-3.5 py-2 border"
                    style={{
                      backgroundColor: `${theme.accent}14`,
                      borderColor: `${theme.accent}33`,
                    }}
                  >
                    <AppText
                      className="text-[13px] font-medium"
                      style={{ color: theme.accent }}
                    >
                      {chip.label}
                    </AppText>
                  </View>
                ))
              ) : (
                <AppText tone="muted" className="text-[13px]">
                  {t("publicProfile.vibeEmpty")}
                </AppText>
              )}
            </View>
          </View>

          {errorKey && profile ? (
            <AppText
              className="text-[13px] text-center mb-3"
              style={{ color: theme.error }}
            >
              {t(errorKey)}
            </AppText>
          ) : null}

          <Pressable
            onPress={() => void onAddCompanion()}
            disabled={ctaDisabled}
            className="w-full items-center justify-center rounded-2xl py-4"
            style={{
              backgroundColor: ctaDisabled
                ? theme.surface
                : theme.buttonPrimary,
              borderWidth: ctaDisabled ? 1 : 0,
              borderColor: theme.border,
              opacity: adding ? 0.7 : 1,
            }}
          >
            {adding ? (
              <ActivityIndicator
                color={ctaDisabled ? theme.textSecondary : theme.buttonText}
              />
            ) : (
              <AppText
                className="text-[16px] font-bold"
                style={{
                  color: ctaDisabled
                    ? theme.textSecondary
                    : theme.buttonText,
                }}
              >
                {ctaLabel}
              </AppText>
            )}
          </Pressable>
        </ScrollView>
      ) : null}
    </View>
  );
}
