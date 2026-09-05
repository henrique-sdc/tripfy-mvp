// Perfil — dados reais do Firestore + vibe (RF03).

import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Haptics from "@/lib/haptics";
import { router, useFocusEffect } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { collection, getCountFromServer } from "firebase/firestore";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Share, useColorScheme } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTabBarPadding } from "@/components/navigation/FloatingTabBar";
import { ProfilePhotoExpand } from "@/components/profile/ProfilePhotoExpand";
import { AppText } from "@/components/ui/AppText";
import { INTERESTS, PACE_OPTIONS } from "@/constants/travel-preferences";
import { useCompanionsList } from "@/hooks/use-companions-list";
import { useTheme } from "@/hooks/use-theme";
import { auth, db } from "@/lib/firebase";
import {
  getUserProfile,
  profilePhotoUri,
  type UserProfile,
} from "@/lib/profile";
import { appDeepLink } from "@/lib/deep-links";
import { useAuthStore } from "@/stores/authStore";
import { useWishlistStore } from "@/stores/wishlistStore";
import { Pressable, ScrollView, View } from "@/tw";

const COMPANIONS_PREVIEW_LIMIT = 4;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function StatCard({
  value,
  label,
  muted,
}: {
  value: string;
  label: string;
  muted?: boolean;
}) {
  const theme = useTheme();
  return (
    <View
      className="flex-1 rounded-2xl border py-3 items-center gap-0.5"
      style={{
        backgroundColor: theme.surface,
        borderColor: theme.border,
        opacity: muted ? 0.6 : 1,
      }}
    >
      <AppText className="text-[18px] font-bold">{value}</AppText>
      <AppText tone="secondary" className="text-[11px]">
        {label}
      </AppText>
    </View>
  );
}

function ProfileActionButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      className="flex-1 items-center justify-center rounded-xl py-2.5"
      style={{
        backgroundColor: theme.surface,
        borderWidth: 1,
        borderColor: theme.border,
      }}
    >
      <AppText className="text-[13px] font-semibold">{label}</AppText>
    </Pressable>
  );
}

export default function ProfileScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const scheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const tabPad = useTabBarPadding();
  const user = useAuthStore((s) => s.user);
  const savedCount = useWishlistStore((s) => s.items.length);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [tripsCount, setTripsCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const { companions } = useCompanionsList();

  // Relê ao focar a tab — sem setLoading(true) se já tem dados (evita
  // “apagar” o perfil na animação de voltar de Configurações).
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const uid = auth.currentUser?.uid;
          const [remote, countSnap] = await Promise.all([
            getUserProfile(),
            uid
              ? getCountFromServer(collection(db, "users", uid, "trips"))
              : null,
          ]);
          if (cancelled) return;
          setProfile(remote);
          setTripsCount(countSnap ? countSnap.data().count : 0);
        } catch (err) {
          console.error("[profile] load:", err);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const displayName =
    profile?.name?.trim() ||
    user?.displayName?.trim() ||
    t("profile.fallbackName");
  const email = profile?.email || user?.email || "";
  const bio = profile?.bio?.trim() || "";
  const photoUri = profilePhotoUri(profile, user?.photoURL);

  const firstName = useMemo(
    () => displayName.split(/\s+/)[0] ?? displayName,
    [displayName],
  );
  const hasFullName = displayName.trim().includes(" ");

  const vibeChips = useMemo(() => {
    const interests = profile?.travel_preferences?.interests ?? [];
    const pace = profile?.travel_preferences?.pace;
    const chips: { key: string; label: string }[] = [];

    for (const value of interests) {
      const meta = INTERESTS.find((i) => i.value === value);
      if (!meta) continue;
      chips.push({
        key: `interest-${value}`,
        label: `${meta.emoji} ${t(meta.labelKey)}`,
      });
    }

    if (pace) {
      const paceMeta = PACE_OPTIONS.find((p) => p.value === pace);
      if (paceMeta) {
        chips.push({
          key: `pace-${pace}`,
          label: `${paceMeta.emoji} ${t(paceMeta.titleKey)}`,
        });
      }
    }

    return chips;
  }, [profile?.travel_preferences, t]);

  // Preview limitado a 4; ordem = ordem do array no Firestore.
  const previewCompanions = companions.slice(0, COMPANIONS_PREVIEW_LIMIT);

  function openEdit() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/edit-profile");
  }

  function openSettings() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/settings");
  }

  function openEditVibe() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/edit-vibe");
  }

  function openCompanions() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/companions");
  }

  async function onShareProfile() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const uid = auth.currentUser?.uid;
    if (!uid) {
      Alert.alert(t("profile.shareNeedAuth"));
      return;
    }
    const link = appDeepLink(`/profile/${uid}`);
    try {
      await Share.share({
        title: t("profile.share.title"),
        message: t("profile.share.message", { link }),
        url: link,
      });
    } catch (err) {
      console.error("[profile] share:", err);
    }
  }

  return (
    <View className="flex-1" style={{ backgroundColor: theme.background }}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingTop: insets.top + 16,
          paddingBottom: tabPad,
          paddingHorizontal: 24,
        }}
        contentInsetAdjustmentBehavior="never"
      >
        <View className="flex-row justify-end mb-2">
          <Pressable
            onPress={openSettings}
            hitSlop={12}
            className="w-10 h-10 rounded-full items-center justify-center"
            style={{ backgroundColor: theme.surface }}
            accessibilityLabel={t("profile.settings")}
          >
            <Ionicons
              name="settings-outline"
              size={20}
              color={theme.textPrimary}
            />
          </Pressable>
        </View>

        <View className="items-center gap-2 mb-5">
          <ProfilePhotoExpand
            photoUri={photoUri}
            displayName={displayName}
            onEdit={openEdit}
          />

          <View className="items-center">
            <AppText
              className="text-[24px] font-bold"
              style={{ letterSpacing: -0.4 }}
            >
              {firstName}
            </AppText>
            {hasFullName ? (
              <AppText tone="secondary" className="text-[13px]">
                {displayName}
              </AppText>
            ) : null}
          </View>

          {email ? (
            <AppText tone="secondary" className="text-[13px]">
              {email}
            </AppText>
          ) : null}
          {bio ? (
            <AppText tone="secondary" className="text-[14px] text-center px-4">
              {bio}
            </AppText>
          ) : null}

          <View className="flex-row gap-2 w-full mt-2">
            <ProfileActionButton
              label={t("profile.editProfile")}
              onPress={openEdit}
            />
            <ProfileActionButton
              label={t("profile.shareProfile")}
              onPress={onShareProfile}
            />
          </View>
        </View>

        <View className="flex-row gap-2.5 mb-2">
          <StatCard
            value={tripsCount === null ? "–" : String(tripsCount)}
            label={t("profile.stats.trips")}
          />
          <StatCard
            value={String(savedCount)}
            label={t("profile.stats.saved")}
          />
          <StatCard
            value={t("profile.stats.soon")}
            label={t("profile.stats.matches")}
            muted
          />
        </View>
        {loading ? (
          <AppText tone="muted" className="text-[11px] text-center mb-6">
            {t("common.loading")}
          </AppText>
        ) : (
          <View className="mb-6" />
        )}

        <View className="gap-3 mb-8">
          <View className="flex-row items-center justify-between">
            <AppText className="text-[18px] font-bold">
              {t("profile.vibe.title")}
            </AppText>
            <Pressable onPress={openEditVibe} hitSlop={8}>
              <AppText tone="accent" className="text-[13px] font-semibold">
                {t("profile.vibe.edit")}
              </AppText>
            </Pressable>
          </View>
          <AppText tone="secondary" className="text-[13px] mb-1">
            {t("profile.vibe.hint")}
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
                {t("profile.vibe.empty")}
              </AppText>
            )}
          </View>
        </View>

        <View className="gap-3">
          <Pressable
            onPress={openCompanions}
            className="flex-row items-center justify-between"
            hitSlop={4}
          >
            <AppText className="text-[18px] font-bold">
              {t("profile.companions.title")}
            </AppText>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={theme.textSecondary}
            />
          </Pressable>
          <AppText tone="secondary" className="text-[13px] mb-1">
            {t("profile.companions.hint")}
          </AppText>

          {previewCompanions.length === 0 ? (
            <View
              className="rounded-2xl border px-4 py-5 items-center gap-2"
              style={{
                backgroundColor: theme.surface,
                borderColor: theme.border,
              }}
            >
              <View
                className="w-12 h-12 rounded-full items-center justify-center"
                style={{ backgroundColor: `${theme.accent}18` }}
              >
                <Ionicons
                  name="people-outline"
                  size={22}
                  color={theme.accent}
                />
              </View>
              <AppText className="text-[14px] font-semibold text-center">
                {t("profile.companions.emptyTitle")}
              </AppText>
              <AppText tone="secondary" className="text-[12px] text-center">
                {t("profile.companions.emptyBody")}
              </AppText>
            </View>
          ) : (
            previewCompanions.map((c) => {
              const name =
                c.name.trim() || t("profile.fallbackName");
              const photo = profilePhotoUri({ photoBase64: c.photoBase64 });
              return (
                <Pressable
                  key={c.uid}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push(`/profile/${c.uid}`);
                  }}
                  className="flex-row items-center gap-3 rounded-2xl border px-4 py-3.5"
                  style={{
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                  }}
                >
                  {photo ? (
                    <Image
                      source={{ uri: photo }}
                      style={{ width: 44, height: 44, borderRadius: 22 }}
                      contentFit="cover"
                    />
                  ) : (
                    <View
                      className="w-11 h-11 rounded-full items-center justify-center"
                      style={{ backgroundColor: `${theme.accent}22` }}
                    >
                      <AppText tone="accent" className="font-bold">
                        {initials(name)}
                      </AppText>
                    </View>
                  )}
                  <View className="flex-1">
                    <AppText className="text-[15px] font-semibold">
                      {name}
                    </AppText>
                    <AppText tone="secondary" className="text-[12px]">
                      {t("profile.companions.added")}
                    </AppText>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={theme.textSecondary}
                  />
                </Pressable>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
}
