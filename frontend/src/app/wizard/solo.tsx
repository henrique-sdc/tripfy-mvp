// Wizard Solo — formulário de nova viagem (RF05) + geração SSE (RF06).
// Layout com style.flex nativo (NativeWind flex-1 quebra em fullScreenModal).
// Datas: início + fim (máx. 15 dias inclusivos) → IA usa época/clima.

import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import * as Haptics from "@/lib/haptics";
import { Href, router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState } from "react";
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
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CapsuleSelector } from "@/components/onboarding/CapsuleSelector";
import { MagicalGenerating } from "@/components/trip/MagicalGenerating";
import { AppText } from "@/components/ui/AppText";
import { Button } from "@/components/ui/Button";
import {
  CURATED_PLACE_ID,
  DestinationAutocomplete,
} from "@/components/wizard/DestinationAutocomplete";
import { BUDGET_OPTIONS } from "@/constants/travel-preferences";
import { useTheme } from "@/hooks/use-theme";
import {
  createMatch,
  generateTripStream,
  NetworkError,
  type PlaceAutocompleteItem,
} from "@/lib/api";
import { stashPendingItinerary } from "@/lib/pendingItinerary";
import {
  MAX_TRIP_DAYS,
  MIN_TRIP_DAYS,
  addLocalDays,
  clampEndToMaxSpan,
  inclusiveDayCount,
  parseIsoDate,
  startOfLocalDay,
  toIsoDate,
} from "@/lib/tripDates";
import {
  clearWizardSoloDraft,
  peekWizardSoloDraft,
  stashWizardSoloDraft,
} from "@/lib/wizardDraft";
import { Pressable } from "@/tw";

type PickerField = "start" | "end" | null;

function defaultStart(): Date {
  return startOfLocalDay(new Date());
}

function defaultEnd(start: Date): Date {
  // Default 5 dias (legado do stepper).
  return addLocalDays(start, 4);
}

function formatDateChip(d: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(d);
}

export default function WizardSoloScreen() {
  const { t, i18n } = useTranslation();
  const { mode, destination: destParam, days: daysParam } =
    useLocalSearchParams<{
      mode?: string;
      destination?: string;
      days?: string;
    }>();
  const theme = useTheme();
  const scheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const isMatch = mode === "match";
  const locale = i18n.language || "pt-BR";

  const today = useMemo(() => defaultStart(), []);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(() => defaultEnd(today));
  const [picker, setPicker] = useState<PickerField>(null);

  const [destination, setDestination] = useState("");
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [budget, setBudget] = useState("moderate");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [creatingMatch, setCreatingMatch] = useState(false);
  const [matchErrorKey, setMatchErrorKey] = useState<string | null>(null);
  const closeStreamRef = useRef<(() => void) | null>(null);

  const days = inclusiveDayCount(startDate, endDate);
  const datesValid = days >= MIN_TRIP_DAYS && days <= MAX_TRIP_DAYS;

  const budgetOptions = BUDGET_OPTIONS.map((o) => ({
    value: o.value,
    label: t(o.labelKey),
  }));

  const canSubmit =
    Boolean(selectedPlaceId) &&
    datesValid &&
    !loading &&
    !creatingMatch;

  // Draft (edit-vibe) tem prioridade; senão query da Em Alta.
  useEffect(() => {
    const saved = peekWizardSoloDraft();
    if (saved) {
      setDestination(saved.destination);
      setSelectedPlaceId(saved.place_id);
      setBudget(saved.budget);
      setNotes(saved.notes);
      const s = parseIsoDate(saved.start_date);
      const e = parseIsoDate(saved.end_date);
      if (s) setStartDate(s);
      if (e) setEndDate(clampEndToMaxSpan(s ?? today, e));
      return;
    }

    const fromQuery =
      typeof destParam === "string" ? destParam.trim() : "";
    if (fromQuery.length >= 2) {
      setDestination(fromQuery);
      setSelectedPlaceId(CURATED_PLACE_ID);
    }

    const hintDays = Number(
      typeof daysParam === "string" ? daysParam : NaN,
    );
    if (
      Number.isFinite(hintDays) &&
      hintDays >= MIN_TRIP_DAYS &&
      hintDays <= MAX_TRIP_DAYS
    ) {
      setEndDate(addLocalDays(today, hintDays - 1));
    }
  }, [today, destParam, daysParam]);

  useEffect(() => {
    return () => {
      closeStreamRef.current?.();
      closeStreamRef.current = null;
    };
  }, []);

  function closeWizard() {
    clearWizardSoloDraft();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (loading) {
      closeStreamRef.current?.();
      closeStreamRef.current = null;
      setLoading(false);
    }
    router.back();
  }

  function openEditVibe() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    stashWizardSoloDraft({
      destination,
      place_id: selectedPlaceId,
      start_date: toIsoDate(startDate),
      end_date: toIsoDate(endDate),
      days,
      budget,
      notes,
    });
    router.push("/edit-vibe");
  }

  function onStartChange(_event: DateTimePickerEvent, date?: Date) {
    if (Platform.OS === "android") setPicker(null);
    if (!date) return;
    Haptics.selectionAsync();
    const nextStart = startOfLocalDay(date);
    setStartDate(nextStart);
    setEndDate((prev) => clampEndToMaxSpan(nextStart, prev));
  }

  function onEndChange(_event: DateTimePickerEvent, date?: Date) {
    if (Platform.OS === "android") setPicker(null);
    if (!date) return;
    Haptics.selectionAsync();
    setEndDate(clampEndToMaxSpan(startDate, date));
  }

  function onDestinationChange(text: string) {
    setDestination(text);
    setSelectedPlaceId(null);
  }

  function onDestinationSelect(item: PlaceAutocompleteItem) {
    setDestination(item.description);
    setSelectedPlaceId(item.place_id);
  }

  async function onGenerate() {
    if (!canSubmit) return;
    if (!datesValid) {
      Alert.alert(
        t("wizard.dateRangeError", { max: MAX_TRIP_DAYS }),
      );
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const payload = {
      destination: destination.trim(),
      days,
      start_date: toIsoDate(startDate),
      end_date: toIsoDate(endDate),
      budget,
      notes: notes.trim(),
    };

    if (isMatch) {
      setCreatingMatch(true);
      setMatchErrorKey(null);
      try {
        const match = await createMatch(payload);
        setCreatingMatch(false);
        clearWizardSoloDraft();
        const href = `/match/${match.id}` as Href;
        router.replace(href);
      } catch (error) {
        setCreatingMatch(false);
        setMatchErrorKey(
          error instanceof NetworkError
            ? "common.networkError"
            : "match.errors.create",
        );
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      return;
    }

    setLoading(true);

    closeStreamRef.current?.();
    closeStreamRef.current = generateTripStream(
      payload,
      undefined,
      (itinerary) => {
        closeStreamRef.current = null;
        setLoading(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        stashPendingItinerary({
          ...itinerary,
          start_date: payload.start_date,
          end_date: payload.end_date,
        });
        clearWizardSoloDraft();
        router.replace("/trip-detail" as Href);
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

  const maxEnd = addLocalDays(startDate, MAX_TRIP_DAYS - 1);

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
            onPress={closeWizard}
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
              {loading
                ? t("wizard.generating.title")
                : isMatch
                  ? t("match.wizard.title")
                  : t("wizard.title")}
            </AppText>
            <AppText tone="secondary" className="text-[12px]">
              {loading
                ? t("wizard.generating.subtitle")
                : isMatch
                  ? t("match.wizard.subtitle")
                  : t("wizard.subtitle")}
            </AppText>
          </RNView>
        </RNView>

        {loading ? (
          <MagicalGenerating destination={destination.trim()} />
        ) : (
          <Animated.View entering={FadeIn.duration(200)} style={styles.flex}>
            <RNScrollView
              style={styles.flex}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <DestinationAutocomplete
                value={destination}
                selectedPlaceId={selectedPlaceId}
                onChangeText={onDestinationChange}
                onSelect={onDestinationSelect}
              />

              <RNView style={styles.field}>
                <AppText className="text-[13px] font-semibold tracking-wide">
                  {t("wizard.durationLabel")}
                </AppText>
                <RNView style={styles.dateRow}>
                  <Pressable
                    onPress={() => {
                      Haptics.selectionAsync();
                      setPicker(picker === "start" ? null : "start");
                    }}
                    style={[
                      styles.dateChip,
                      {
                        backgroundColor: theme.surface,
                        borderColor:
                          picker === "start" ? theme.accent : theme.border,
                      },
                    ]}
                    accessibilityLabel={t("wizard.startDateLabel")}
                  >
                    <AppText tone="muted" className="text-[11px]">
                      {t("wizard.startDateLabel")}
                    </AppText>
                    <AppText className="text-[15px] font-semibold">
                      {formatDateChip(startDate, locale)}
                    </AppText>
                  </Pressable>
                  <Ionicons
                    name="arrow-forward"
                    size={16}
                    color={theme.textMuted}
                  />
                  <Pressable
                    onPress={() => {
                      Haptics.selectionAsync();
                      setPicker(picker === "end" ? null : "end");
                    }}
                    style={[
                      styles.dateChip,
                      {
                        backgroundColor: theme.surface,
                        borderColor:
                          picker === "end" ? theme.accent : theme.border,
                      },
                    ]}
                    accessibilityLabel={t("wizard.endDateLabel")}
                  >
                    <AppText tone="muted" className="text-[11px]">
                      {t("wizard.endDateLabel")}
                    </AppText>
                    <AppText className="text-[15px] font-semibold">
                      {formatDateChip(endDate, locale)}
                    </AppText>
                  </Pressable>
                </RNView>

                {picker === "start" ? (
                  <DateTimePicker
                    value={startDate}
                    mode="date"
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    minimumDate={today}
                    onChange={onStartChange}
                    themeVariant={scheme === "dark" ? "dark" : "light"}
                  />
                ) : null}
                {picker === "end" ? (
                  <DateTimePicker
                    value={endDate}
                    mode="date"
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    minimumDate={startDate}
                    maximumDate={maxEnd}
                    onChange={onEndChange}
                    themeVariant={scheme === "dark" ? "dark" : "light"}
                  />
                ) : null}

                <AppText
                  className="text-[14px] font-semibold"
                  style={{ color: theme.accent }}
                >
                  {t("wizard.daysComputed", { count: days })}
                </AppText>
                <AppText tone="muted" className="text-[11px]">
                  {t("wizard.maxDaysHint", { max: MAX_TRIP_DAYS })}
                </AppText>
                {!datesValid ? (
                  <AppText tone="error" className="text-[12px]">
                    {t("wizard.dateRangeError", { max: MAX_TRIP_DAYS })}
                  </AppText>
                ) : null}
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
                onPress={openEditVibe}
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
              {matchErrorKey && (
                <AppText
                  tone="error"
                  className="mb-2 text-center text-[13px]"
                >
                  {t(matchErrorKey)}
                </AppText>
              )}
              <Button
                onPress={() => void onGenerate()}
                loading={loading || creatingMatch}
                disabled={!canSubmit}
              >
                {isMatch ? t("match.wizard.create") : t("wizard.generate")}
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
    overflow: "visible",
  },
  field: { gap: 10 },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  dateChip: {
    flex: 1,
    gap: 4,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
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
});
