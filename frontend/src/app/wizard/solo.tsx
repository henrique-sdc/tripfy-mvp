// Wizard Solo — formulário de nova viagem (RF05) + geração SSE (RF06).
// Layout com style.flex nativo (NativeWind flex-1 quebra em fullScreenModal).

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Href, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView as RNScrollView,
  StyleSheet,
  TextInput as RNTextInput,
  useColorScheme,
  View as RNView,
} from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CapsuleSelector } from "@/components/onboarding/CapsuleSelector";
import { AppText } from "@/components/ui/AppText";
import { Button } from "@/components/ui/Button";
import { BUDGET_OPTIONS } from "@/constants/travel-preferences";
import { useTheme } from "@/hooks/use-theme";
import { generateTripStream } from "@/lib/api";
import { Pressable, View } from "@/tw";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const SPRING = { damping: 20, stiffness: 300 };
const MIN_DAYS = 1;
const MAX_DAYS = 30;

function DayStepper({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();

  function bump(delta: number) {
    const next = Math.min(MAX_DAYS, Math.max(MIN_DAYS, value + delta));
    if (next === value) return;
    Haptics.selectionAsync();
    onChange(next);
  }

  return (
    <View
      className="flex-row items-center justify-between rounded-2xl border px-3 py-2"
      style={{ backgroundColor: theme.surface, borderColor: theme.border }}
    >
      <StepperBtn
        icon="remove"
        onPress={() => bump(-1)}
        disabled={value <= MIN_DAYS}
      />
      <AppText className="text-[18px] font-bold">
        {t("wizard.daysLabel", { count: value })}
      </AppText>
      <StepperBtn
        icon="add"
        onPress={() => bump(1)}
        disabled={value >= MAX_DAYS}
      />
    </View>
  );
}

function StepperBtn({
  icon,
  onPress,
  disabled,
}: {
  icon: "add" | "remove";
  onPress: () => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => {
        if (disabled) return;
        scale.value = withSpring(0.9, SPRING);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, SPRING);
      }}
      style={[
        style,
        {
          width: 44,
          height: 44,
          borderRadius: 22,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.background,
          opacity: disabled ? 0.35 : 1,
        },
      ]}
    >
      <Ionicons name={icon} size={22} color={theme.textPrimary} />
    </AnimatedPressable>
  );
}

/** UI imersiva enquanto o SSE remonta o JSON do roteiro. */
function MagicalGenerating({ destination }: { destination: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const pulse = useSharedValue(0.45);
  const spin = useSharedValue(0);
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    // Respiração suave — geração é evento raro, merece delight (Emil).
    pulse.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) }),
      -1,
      true,
    );
    spin.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1400, easing: Easing.out(Easing.cubic) }),
        withTiming(0, { duration: 0 }),
      ),
      -1,
      false,
    );

    const id = setInterval(() => setPhase((p) => (p + 1) % 2), 2800);
    return () => clearInterval(id);
  }, [pulse, spin]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
    transform: [{ scale: 0.96 + pulse.value * 0.04 }],
  }));

  const sparkleStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value * 360}deg` }],
  }));

  const statusText =
    phase === 0
      ? t("wizard.generating.exploringMap")
      : t("wizard.generating.craftingTrip", { destination });

  return (
    <Animated.View
      entering={FadeIn.duration(220)}
      exiting={FadeOut.duration(160)}
      style={styles.magicRoot}
    >
      <Animated.View
        style={[
          styles.magicOrb,
          { backgroundColor: `${theme.accent}18` },
          sparkleStyle,
        ]}
      >
        <Ionicons name="sparkles" size={36} color={theme.accent} />
      </Animated.View>
      <Animated.View style={pulseStyle}>
        <AppText
          className="text-center text-[18px] font-semibold"
          style={{ letterSpacing: -0.2 }}
        >
          {statusText}
        </AppText>
      </Animated.View>
      <AppText tone="secondary" className="text-center text-[13px]">
        {t("wizard.generating.hint")}
      </AppText>
    </Animated.View>
  );
}

export default function WizardSoloScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const scheme = useColorScheme();
  const insets = useSafeAreaInsets();

  const [destination, setDestination] = useState("");
  const [days, setDays] = useState(5);
  const [budget, setBudget] = useState("moderate");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const closeStreamRef = useRef<(() => void) | null>(null);

  const budgetOptions = BUDGET_OPTIONS.map((o) => ({
    value: o.value,
    label: t(o.labelKey),
  }));

  const canSubmit = destination.trim().length >= 2 && !loading;

  useEffect(() => {
    return () => {
      closeStreamRef.current?.();
      closeStreamRef.current = null;
    };
  }, []);

  function onGenerate() {
    if (!canSubmit) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);

    closeStreamRef.current?.();
    closeStreamRef.current = generateTripStream(
      {
        destination: destination.trim(),
        days,
        budget,
        notes: notes.trim(),
      },
      undefined,
      (itinerary) => {
        closeStreamRef.current = null;
        setLoading(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        // Cast: tipagem do Expo Router só regenera após o Metro subir com a rota nova.
        const href = {
          pathname: "/trip-detail",
          params: { itinerary: JSON.stringify(itinerary) },
        } as unknown as Href;
        router.replace(href);
      },
      (error) => {
        closeStreamRef.current = null;
        setLoading(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert(
          t("wizard.generating.errorTitle"),
          error.message || t("wizard.generating.errorBody"),
          [{ text: t("wizard.generating.errorOk") }],
        );
      },
    );
  }

  return (
    <RNView style={[styles.root, { backgroundColor: theme.background }]}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <RNView
          style={[
            styles.header,
            {
              paddingTop: insets.top + 8,
              borderBottomColor: theme.border,
              backgroundColor: theme.background,
            },
          ]}
        >
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              if (loading) {
                closeStreamRef.current?.();
                closeStreamRef.current = null;
                setLoading(false);
              }
              router.back();
            }}
            hitSlop={12}
            style={[styles.closeBtn, { backgroundColor: theme.surface }]}
            accessibilityLabel={t("wizard.close")}
          >
            <Ionicons name="close" size={22} color={theme.textPrimary} />
          </Pressable>
          <RNView style={styles.headerCopy}>
            <AppText
              className="text-[18px] font-bold"
              style={{ letterSpacing: -0.3 }}
            >
              {loading ? t("wizard.generating.title") : t("wizard.title")}
            </AppText>
            <AppText tone="secondary" className="text-[12px]">
              {loading
                ? t("wizard.generating.subtitle")
                : t("wizard.subtitle")}
            </AppText>
          </RNView>
        </RNView>

        {loading ? (
          <MagicalGenerating destination={destination.trim()} />
        ) : (
          <Animated.View
            entering={FadeIn.duration(200)}
            style={styles.flex}
          >
            <RNScrollView
              style={styles.flex}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <RNView style={styles.field}>
                <AppText className="text-[13px] font-semibold tracking-wide">
                  {t("wizard.destinationLabel")}
                </AppText>
                <RNView
                  style={[
                    styles.inputRow,
                    {
                      backgroundColor: theme.surface,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <Ionicons name="location" size={20} color={theme.accent} />
                  <RNTextInput
                    value={destination}
                    onChangeText={setDestination}
                    placeholder={t("wizard.destinationPlaceholder")}
                    placeholderTextColor={theme.textMuted}
                    style={[styles.input, { color: theme.textPrimary }]}
                    autoCapitalize="words"
                    returnKeyType="next"
                  />
                </RNView>
                <AppText tone="muted" className="text-[11px]">
                  {t("wizard.destinationHint")}
                </AppText>
              </RNView>

              <RNView style={styles.field}>
                <AppText className="text-[13px] font-semibold tracking-wide">
                  {t("wizard.durationLabel")}
                </AppText>
                <DayStepper value={days} onChange={setDays} />
              </RNView>

              <RNView style={styles.field}>
                <AppText className="text-[13px] font-semibold tracking-wide">
                  {t("wizard.budgetLabel")}
                </AppText>
                <CapsuleSelector
                  options={budgetOptions}
                  value={budget}
                  onChange={setBudget}
                />
              </RNView>

              <RNView style={styles.field}>
                <AppText className="text-[13px] font-semibold tracking-wide">
                  {t("wizard.notesLabel")}
                </AppText>
                <RNTextInput
                  value={notes}
                  onChangeText={setNotes}
                  placeholder={t("wizard.notesPlaceholder")}
                  placeholderTextColor={theme.textMuted}
                  multiline
                  textAlignVertical="top"
                  style={[
                    styles.notes,
                    {
                      color: theme.textPrimary,
                      backgroundColor: theme.surface,
                      borderColor: theme.border,
                    },
                  ]}
                />
              </RNView>

              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.back();
                  setTimeout(() => router.navigate("/(tabs)/profile"), 200);
                }}
                style={[
                  styles.vibeRow,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                  },
                ]}
              >
                <RNView
                  style={[
                    styles.vibeIcon,
                    { backgroundColor: `${theme.accent}18` },
                  ]}
                >
                  <Ionicons name="sparkles" size={18} color={theme.accent} />
                </RNView>
                <RNView style={styles.flex}>
                  <AppText className="text-[14px] font-semibold">
                    {t("wizard.vibeTitle")}
                  </AppText>
                  <AppText tone="secondary" className="text-[12px]">
                    {t("wizard.vibeHint")}
                  </AppText>
                </RNView>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={theme.textSecondary}
                />
              </Pressable>
            </RNScrollView>

            <RNView
              style={[
                styles.footer,
                {
                  paddingBottom: Math.max(insets.bottom, 16),
                  backgroundColor: theme.background,
                  borderTopColor: theme.border,
                },
              ]}
            >
              <Button
                onPress={onGenerate}
                loading={loading}
                disabled={!canSubmit}
              >
                {t("wizard.generate")}
              </Button>
            </RNView>
          </Animated.View>
        )}
      </KeyboardAvoidingView>
    </RNView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCopy: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 24,
    gap: 28,
  },
  field: { gap: 10 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  input: {
    flex: 1,
    fontSize: 16,
    padding: 0,
  },
  notes: {
    minHeight: 100,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
  },
  vibeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  vibeIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  magicRoot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 20,
  },
  magicOrb: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
});
