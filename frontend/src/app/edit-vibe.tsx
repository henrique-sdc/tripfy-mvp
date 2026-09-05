// Editar "Sua vibe" pós-onboarding (RF03 — nota: preferências editáveis a
// qualquer momento). Reaproveita os componentes/constantes do onboarding
// (não altera (onboarding)/preferences.tsx), mas em layout de tela "editar"
// (header + botão fixo no fim), não o wizard de primeira vez.

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyboardAvoidingView, Platform, useColorScheme } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CapsuleSelector } from "@/components/onboarding/CapsuleSelector";
import { InterestPill } from "@/components/onboarding/InterestPill";
import { PaceCard } from "@/components/onboarding/PaceCard";
import { AppText } from "@/components/ui/AppText";
import { Button } from "@/components/ui/Button";
import {
  BUDGET_OPTIONS,
  DIETARY_OPTIONS,
  INTERESTS,
  PACE_OPTIONS,
  TRANSPORT_OPTIONS,
  TRAVELER_OPTIONS,
} from "@/constants/travel-preferences";
import { useTheme } from "@/hooks/use-theme";
import { NetworkError, savePreferences } from "@/lib/api";
import { getUserProfile } from "@/lib/profile";
import { Pressable, ScrollView, TextInput, View } from "@/tw";

const OTHER_PREFERENCES_MAX = 280;

export default function EditVibeScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const scheme = useColorScheme();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const [interests, setInterests] = useState<string[]>([]);
  const [pace, setPace] = useState<string | null>(null);
  const [transportModes, setTransportModes] = useState<string[]>([]);
  const [dietary, setDietary] = useState<string>("none");
  const [budget, setBudget] = useState<string>("moderate");
  const [travelerType, setTravelerType] = useState<string>("couple");
  const [otherPreferences, setOtherPreferences] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const profile = await getUserProfile();
        const prefs = profile?.travel_preferences;
        if (cancelled || !prefs) return;
        setInterests(prefs.interests ?? []);
        setPace(prefs.pace ?? null);
        setTransportModes(prefs.transport_modes ?? []);
        setDietary(prefs.dietary_style ?? "none");
        setBudget(prefs.budget_range ?? "moderate");
        setTravelerType(prefs.traveler_type ?? "couple");
        setOtherPreferences(prefs.other_preferences ?? "");
      } catch (err) {
        console.error("[edit-vibe] load:", err);
        if (!cancelled) setErrorKey("editVibe.errors.loadFailed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const canSubmit = interests.length >= 1 && pace !== null && Boolean(budget);

  function toggleInterest(value: string) {
    setInterests((prev) =>
      prev.includes(value) ? prev.filter((i) => i !== value) : [...prev, value],
    );
  }

  function toggleTransport(value: string) {
    setTransportModes((prev) =>
      prev.includes(value) ? prev.filter((m) => m !== value) : [...prev, value],
    );
  }

  async function onSave() {
    if (!canSubmit || !pace) {
      setErrorKey("editVibe.errors.minimum");
      return;
    }
    setSubmitting(true);
    setErrorKey(null);
    try {
      await savePreferences({
        interests,
        pace,
        transport_modes: transportModes,
        dietary_style: dietary,
        budget_range: budget,
        traveler_type: travelerType,
        other_preferences: otherPreferences.trim(),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (err) {
      console.error("[edit-vibe] save:", err);
      setErrorKey(
        err instanceof NetworkError
          ? "common.networkError"
          : "common.genericError",
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSubmitting(false);
    }
  }

  const budgetOptions = BUDGET_OPTIONS.map((o) => ({
    value: o.value,
    label: t(o.labelKey),
  }));
  const travelerOptions = TRAVELER_OPTIONS.map((o) => ({
    value: o.value,
    label: t(o.labelKey),
  }));
  const intenseBalanced = PACE_OPTIONS.filter((p) => p.value !== "relaxed");
  const relaxedPace = PACE_OPTIONS.find((p) => p.value === "relaxed")!;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
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
          {t("editVibe.title")}
        </AppText>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <AppText tone="secondary">{t("common.loading")}</AppText>
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingBottom: insets.bottom + 32,
            gap: 28,
          }}
          showsVerticalScrollIndicator={false}
        >
          <View className="gap-3">
            <AppText className="text-lg font-semibold">
              {t("onboarding.vibe.interestsSection")}
            </AppText>
            <View className="flex-row flex-wrap gap-2.5">
              {INTERESTS.map((item) => (
                <InterestPill
                  key={item.value}
                  emoji={item.emoji}
                  label={t(item.labelKey)}
                  selected={interests.includes(item.value)}
                  disabled={submitting}
                  onToggle={() => toggleInterest(item.value)}
                />
              ))}
            </View>
          </View>

          <View className="gap-3">
            <AppText className="text-lg font-semibold">
              {t("onboarding.vibe.paceSection")}
            </AppText>
            <View className="flex-row gap-3">
              {intenseBalanced.map((item) => (
                <PaceCard
                  key={item.value}
                  emoji={item.emoji}
                  title={t(item.titleKey)}
                  description={t(item.descKey)}
                  selected={pace === item.value}
                  anySelected={pace !== null}
                  disabled={submitting}
                  onSelect={() => setPace(item.value)}
                />
              ))}
            </View>
            <PaceCard
              emoji={relaxedPace.emoji}
              title={t(relaxedPace.titleKey)}
              description={t(relaxedPace.descKey)}
              selected={pace === relaxedPace.value}
              anySelected={pace !== null}
              disabled={submitting}
              onSelect={() => setPace(relaxedPace.value)}
            />
          </View>

          <View className="gap-3">
            <AppText className="text-lg font-semibold">
              {t("onboarding.vibe.transportSection")}
            </AppText>
            <View className="flex-row flex-wrap gap-2.5">
              {TRANSPORT_OPTIONS.map((item) => (
                <InterestPill
                  key={item.value}
                  emoji={item.emoji}
                  label={t(item.labelKey)}
                  selected={transportModes.includes(item.value)}
                  disabled={submitting}
                  onToggle={() => toggleTransport(item.value)}
                />
              ))}
            </View>
          </View>

          <View className="gap-3">
            <AppText className="text-lg font-semibold">
              {t("onboarding.vibe.dietarySection")}
            </AppText>
            <View className="flex-row flex-wrap gap-2.5">
              {DIETARY_OPTIONS.map((item) => (
                <InterestPill
                  key={item.value}
                  emoji={item.emoji}
                  label={t(item.labelKey)}
                  selected={dietary === item.value}
                  disabled={submitting}
                  onToggle={() => setDietary(item.value)}
                />
              ))}
            </View>
          </View>

          <View className="gap-3">
            <AppText className="text-lg font-semibold">
              {t("onboarding.vibe.budgetSection")}
            </AppText>
            <CapsuleSelector
              options={budgetOptions}
              value={budget}
              onChange={setBudget}
              disabled={submitting}
            />
          </View>

          <View className="gap-3">
            <AppText className="text-lg font-semibold">
              {t("onboarding.vibe.travelerSection")}
            </AppText>
            <CapsuleSelector
              options={travelerOptions}
              value={travelerType}
              onChange={setTravelerType}
              disabled={submitting}
            />
          </View>

          {/* Campo livre — cobre gostos fora das tags fixas; a IA lê isso no prompt. */}
          <View className="gap-2">
            <AppText className="text-lg font-semibold">
              {t("editVibe.otherSection")}
            </AppText>
            <AppText tone="secondary" className="text-sm">
              {t("editVibe.otherHint")}
            </AppText>
            <View
              className="rounded-2xl border px-4 py-3"
              style={{ borderColor: theme.border, backgroundColor: theme.surface }}
            >
              <TextInput
                value={otherPreferences}
                onChangeText={(v) =>
                  setOtherPreferences(v.slice(0, OTHER_PREFERENCES_MAX))
                }
                editable={!submitting}
                multiline
                numberOfLines={3}
                maxLength={OTHER_PREFERENCES_MAX}
                placeholder={t("editVibe.otherPlaceholder")}
                placeholderTextColor={theme.textMuted}
                style={{
                  color: theme.textPrimary,
                  fontSize: 15,
                  minHeight: 72,
                  textAlignVertical: "top",
                }}
              />
            </View>
            <AppText tone="muted" className="text-[11px] self-end">
              {t("editVibe.otherCounter", { count: otherPreferences.length })}
            </AppText>
          </View>

          {errorKey && (
            <AppText tone="error" className="text-sm text-center">
              {t(errorKey)}
            </AppText>
          )}

          <Button onPress={onSave} loading={submitting} disabled={!canSubmit}>
            {t("editVibe.save")}
          </Button>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}
