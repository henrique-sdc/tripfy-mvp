// Tela "Sua vibe" — onboarding tátil (Seção 3.3 / RF01).
// Zero campos de texto: pills, cards e cápsulas com haptics + spring.
// CTA flutuante na base; barra sólida (Android) ou fade no topo (iOS).

import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
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
import { NetworkError, savePreferences, type TravelPreferences } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { ScrollView, View } from "@/tw";

const FOOTER_HEIGHT = 112;
const FOOTER_FADE_HEIGHT = 24;

export default function PreferencesScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const setHasPreferences = useAuthStore((s) => s.setHasPreferences);

  const [interests, setInterests] = useState<string[]>([]);
  const [pace, setPace] = useState<string | null>(null);
  const [transportModes, setTransportModes] = useState<string[]>([]);
  const [dietary, setDietary] = useState<string>("none");
  const [budget, setBudget] = useState<string>("moderate");
  const [travelerType, setTravelerType] = useState<string>("couple");
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = interests.length >= 1 && pace !== null && Boolean(budget);

  const glow = useSharedValue(1);
  useEffect(() => {
    if (canSubmit) {
      glow.value = withRepeat(
        withSequence(
          withTiming(1.02, { duration: 600 }),
          withTiming(1, { duration: 600 }),
        ),
        -1,
        true,
      );
    } else {
      glow.value = 1;
    }
  }, [canSubmit, glow]);

  const ctaGlowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: glow.value }],
  }));

  const budgetOptions = useMemo(
    () => BUDGET_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) })),
    [t],
  );

  const travelerOptions = useMemo(
    () => TRAVELER_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) })),
    [t],
  );

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

  async function handleSubmit() {
    if (!canSubmit || !pace) {
      setErrorKey("onboarding.vibe.errorMinimum");
      return;
    }

    setSubmitting(true);
    setErrorKey(null);

    const payload: TravelPreferences = {
      interests,
      pace,
      transport_modes: transportModes,
      dietary_style: dietary,
      budget_range: budget,
      traveler_type: travelerType,
    };

    try {
      await savePreferences(payload);
      setHasPreferences(true);
    } catch (error) {
      console.error("[preferences] Falha ao salvar preferências:", error);
      setErrorKey(
        error instanceof NetworkError ? "common.networkError" : "common.genericError",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const intenseBalanced = PACE_OPTIONS.filter((p) => p.value !== "relaxed");
  const relaxedPace = PACE_OPTIONS.find((p) => p.value === "relaxed")!;

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: insets.top + 24,
          paddingHorizontal: 24,
          paddingBottom: FOOTER_HEIGHT + insets.bottom + 24,
          gap: 32,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Cabeçalho — stop slop: direto, sem enrolação */}
        <View className="gap-2">
          <AppText className="text-[36px] font-bold tracking-tight leading-tight">
            {t("onboarding.vibe.title")}
          </AppText>
          <AppText tone="secondary" className="text-[17px] leading-6">
            {t("onboarding.vibe.subtitle")}
          </AppText>
        </View>

        {/* Interesses — nuvem de pills */}
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

        {/* Ritmo — cards grandes */}
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

        {/* Locomoção — multi-select (opcional pro CTA, vital pro Maps/LLM) */}
        <View className="gap-3">
          <View className="gap-1">
            <AppText className="text-lg font-semibold">
              {t("onboarding.vibe.transportSection")}
            </AppText>
            <AppText tone="secondary" className="text-sm">
              {t("onboarding.vibe.transportHint")}
            </AppText>
          </View>
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

        {/* Alimentação — opcional, default none */}
        <View className="gap-3">
          <View className="gap-1">
            <AppText className="text-lg font-semibold">
              {t("onboarding.vibe.dietarySection")}
            </AppText>
            <AppText tone="secondary" className="text-sm">
              {t("onboarding.vibe.dietaryHint")}
            </AppText>
          </View>
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

        {/* Orçamento — cápsula deslizante */}
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

        {/* Companhia — cápsula deslizante */}
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

        {errorKey && (
          <AppText tone="error" className="text-sm text-center">
            {t(errorKey)}
          </AppText>
        )}
      </ScrollView>

      {/* CTA flutuante — barra sólida; fade só no iOS (LinearGradient instável no Android) */}
      <View
        className="absolute bottom-0 left-0 right-0 px-6"
        style={{
          paddingBottom: insets.bottom + 16,
          paddingTop: Platform.OS === "ios" ? FOOTER_FADE_HEIGHT : 16,
          backgroundColor: theme.background,
          ...(Platform.OS === "android" && {
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: theme.border,
          }),
        }}
        pointerEvents="box-none"
      >
        {Platform.OS === "ios" && (
          <LinearGradient
            colors={["transparent", theme.background]}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              height: FOOTER_FADE_HEIGHT,
            }}
            pointerEvents="none"
          />
        )}

        <Animated.View style={canSubmit ? ctaGlowStyle : undefined}>
          <Button
            onPress={handleSubmit}
            loading={submitting}
            disabled={!canSubmit}
            className={!canSubmit ? "opacity-40" : ""}
          >
            {submitting
              ? t("common.saving")
              : canSubmit
                ? t("onboarding.vibe.ctaReady")
                : t("onboarding.vibe.ctaDisabled")}
          </Button>
        </Animated.View>
      </View>
    </View>
  );
}
