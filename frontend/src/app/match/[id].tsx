import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Haptics from "@/lib/haptics";
import { Href, router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { doc, onSnapshot } from "firebase/firestore";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  ScrollView,
  Share,
  StyleSheet,
  TextInput,
  useColorScheme,
} from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  formatTripDateSpan,
} from "@/lib/tripDates";
import { MagicalGenerating } from "@/components/trip/MagicalGenerating";
import { AppText } from "@/components/ui/AppText";
import { useCompanionsList } from "@/hooks/use-companions-list";
import { useTheme } from "@/hooks/use-theme";
import {
  ApiError,
  generateMatchStream,
  getMatch,
  getPublicProfile,
  type ItineraryResponse,
  joinMatch,
  type MatchInDB,
  type MatchInviteSummary,
  NetworkError,
  type UserPublicProfile,
} from "@/lib/api";
import { db } from "@/lib/firebase";
import { appDeepLink } from "@/lib/deep-links";
import { stashPendingItinerary } from "@/lib/pendingItinerary";
import {
  getUserProfile,
  profilePhotoUri,
  type UserProfile,
} from "@/lib/profile";
import { useAuthStore } from "@/stores/authStore";
import { Pressable, View } from "@/tw";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const SPRING = { damping: 20, stiffness: 300 };

type MatchView = MatchInviteSummary | MatchInDB;

type PersonSlot = {
  label: string;
  name?: string;
  photoUri: string | null;
  waiting?: boolean;
};

function isParticipantMatch(match: MatchView): match is MatchInDB {
  return "owner_uid" in match;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function ActionButton({
  children,
  onPress,
  disabled = false,
  secondary = false,
  accessibilityLabel,
}: {
  children: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  accessibilityLabel: string;
}) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPressIn={() => {
        if (disabled) return;
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        scale.value = reduceMotion ? 1 : withSpring(0.97, SPRING);
      }}
      onPressOut={() => {
        scale.value = reduceMotion ? 1 : withSpring(1, SPRING);
      }}
      style={[
        animatedStyle,
        styles.actionButton,
        {
          backgroundColor: secondary ? theme.surface : theme.buttonPrimary,
          borderColor: secondary ? theme.border : theme.buttonPrimary,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      <AppText
        className="text-[16px] font-bold"
        style={{
          color: secondary ? theme.textPrimary : theme.buttonText,
        }}
      >
        {children}
      </AppText>
    </AnimatedPressable>
  );
}

function PersonAvatar({
  slot,
  accent,
}: {
  slot: PersonSlot;
  accent: boolean;
}) {
  const theme = useTheme();
  const display = slot.name?.trim() || slot.label;
  const borderStyle = slot.waiting ? ("dashed" as const) : ("solid" as const);

  return (
    <View style={styles.personColumn}>
      <View
        style={[
          styles.avatar,
          {
            backgroundColor: accent ? `${theme.accent}16` : theme.surface,
            borderColor: accent ? theme.accent : theme.border,
            borderStyle,
            overflow: "hidden",
          },
        ]}
      >
        {slot.photoUri ? (
          <Image
            source={{ uri: slot.photoUri }}
            style={styles.avatarImage}
            contentFit="cover"
          />
        ) : slot.waiting ? (
          <Ionicons
            name="person-add-outline"
            size={38}
            color={theme.textMuted}
          />
        ) : (
          <AppText tone="accent" className="text-[28px] font-bold">
            {initials(display)}
          </AppText>
        )}
      </View>
      <AppText
        tone={slot.waiting ? "secondary" : "primary"}
        className="text-[14px] font-semibold text-center"
        numberOfLines={1}
      >
        {slot.name?.trim() || slot.label}
      </AppText>
      {slot.name?.trim() && slot.label !== slot.name.trim() ? (
        <AppText tone="secondary" className="text-[11px] text-center">
          {slot.label}
        </AppText>
      ) : null}
    </View>
  );
}

function PairVisual({
  left,
  right,
}: {
  left: PersonSlot;
  right: PersonSlot;
}) {
  const theme = useTheme();

  return (
    <Animated.View
      entering={FadeInDown.duration(220).easing(Easing.out(Easing.cubic))}
      style={styles.pairRow}
    >
      <PersonAvatar slot={left} accent />
      <View
        style={[styles.connection, { backgroundColor: theme.background }]}
      >
        <Ionicons name="infinite" size={34} color={theme.accent} />
      </View>
      <PersonAvatar slot={right} accent={!right.waiting} />
    </Animated.View>
  );
}

export default function MatchLobbyScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const theme = useTheme();
  const scheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((state) => state.user);
  const reduceMotion = useReducedMotion();

  const [match, setMatch] = useState<MatchView | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState(false);
  const [myProfile, setMyProfile] = useState<UserProfile | null>(null);
  const [otherProfile, setOtherProfile] = useState<UserPublicProfile | null>(
    null,
  );
  const [selectedCompanion, setSelectedCompanion] =
    useState<UserPublicProfile | null>(null);
  const [guestNotes, setGuestNotes] = useState("");

  const { companions } = useCompanionsList();

  const closeStreamRef = useRef<(() => void) | null>(null);
  const previousStatusRef = useRef<MatchView["status"] | null>(null);
  const generationAttemptedRef = useRef(false);
  const navigatedRef = useRef(false);
  const matchRef = useRef(match);
  matchRef.current = match;
  const pulse = useSharedValue(1);

  const matchId = Array.isArray(id) ? id[0] : id;
  const fullMatch = match && isParticipantMatch(match) ? match : null;
  const isOwner = Boolean(
    fullMatch && user?.uid === fullMatch.owner_uid,
  );
  const canSubscribe = Boolean(
    matchId &&
      fullMatch &&
      user &&
      fullMatch.participants.includes(user.uid),
  );
  const isGenerating = Boolean(
    fullMatch &&
      (fullMatch.status === "generating" ||
        fullMatch.generation_lock != null),
  );
  const connected = Boolean(fullMatch?.participants.length === 2);
  const otherUid =
    fullMatch && user
      ? fullMatch.participants.find((uid) => uid !== user.uid)
      : undefined;
  const inviteOwner =
    match && !isParticipantMatch(match) ? match.owner : null;
  const isGuestLobby = Boolean(match && !isOwner && !fullMatch);

  // Foto/nome do usuário logado (lado "Você").
  useEffect(() => {
    let cancelled = false;
    void getUserProfile()
      .then((profile) => {
        if (!cancelled) setMyProfile(profile);
      })
      .catch((err) => console.error("[match] my profile:", err));
    return () => {
      cancelled = true;
    };
  }, []);

  // Quando a dupla fecha, hidrata o outro participante (foto/nome).
  useEffect(() => {
    if (!otherUid) {
      setOtherProfile(null);
      return;
    }
    let cancelled = false;
    void getPublicProfile(otherUid)
      .then((profile) => {
        if (!cancelled) {
          setOtherProfile(profile);
          setSelectedCompanion(null);
        }
      })
      .catch((err) => console.error("[match] other profile:", err));
    return () => {
      cancelled = true;
    };
  }, [otherUid]);

  const myPhotoUri = profilePhotoUri(myProfile, user?.photoURL);
  const myDisplayName =
    myProfile?.name?.trim() ||
    user?.displayName?.trim() ||
    t("profile.fallbackName");

  const pairSlots = useMemo(() => {
    const meSlot: PersonSlot = {
      label: t("match.lobby.you"),
      name: myDisplayName,
      photoUri: myPhotoUri,
    };

    if (!isOwner) {
      // Convidado: esquerda = anfitrião (do invite ou pós-join), direita = eu.
      const ownerSource = otherProfile ?? inviteOwner;
      const ownerSlot: PersonSlot = ownerSource
        ? {
            label: t("match.lobby.companion"),
            name: ownerSource.name.trim() || t("profile.fallbackName"),
            photoUri: profilePhotoUri({
              photoBase64: ownerSource.photoBase64,
            }),
          }
        : {
            label: t("match.lobby.companion"),
            photoUri: null,
          };
      return { left: ownerSlot, right: meSlot };
    }

    if (connected && otherProfile) {
      return {
        left: meSlot,
        right: {
          label: t("match.lobby.connected"),
          name: otherProfile.name.trim() || t("profile.fallbackName"),
          photoUri: profilePhotoUri({
            photoBase64: otherProfile.photoBase64,
          }),
        } satisfies PersonSlot,
      };
    }

    if (selectedCompanion) {
      return {
        left: meSlot,
        right: {
          label: t("match.lobby.companion"),
          name:
            selectedCompanion.name.trim() || t("profile.fallbackName"),
          photoUri: profilePhotoUri({
            photoBase64: selectedCompanion.photoBase64,
          }),
        } satisfies PersonSlot,
      };
    }

    return {
      left: meSlot,
      right: {
        label: t("match.lobby.waiting"),
        photoUri: null,
        waiting: true,
      } satisfies PersonSlot,
    };
  }, [
    connected,
    inviteOwner,
    isOwner,
    myDisplayName,
    myPhotoUri,
    otherProfile,
    selectedCompanion,
    t,
  ]);

  const showCompanionPicker =
    isOwner && !connected && companions.length > 0 && !isGenerating;

  const navigateToItinerary = useCallback(
    (itinerary: ItineraryResponse) => {
      if (navigatedRef.current) return;
      navigatedRef.current = true;
      void Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success,
      );
      // Stash em memória — JSON multi-dia estoura o limite de params da URL.
      const session = matchRef.current;
      stashPendingItinerary(
        {
          ...itinerary,
          start_date: session?.start_date?.trim() || itinerary.start_date,
          end_date: session?.end_date?.trim() || itinerary.end_date,
        },
        { matchId: session?.id || matchId },
      );
      router.replace("/trip-detail" as Href);
    },
    [matchId],
  );

  const startGeneration = useCallback(() => {
    if (!matchId || generationAttemptedRef.current) return;
    generationAttemptedRef.current = true;
    setGenerationError(false);
    closeStreamRef.current?.();
    closeStreamRef.current = generateMatchStream(
      matchId,
      undefined,
      (itinerary) => {
        closeStreamRef.current = null;
        navigateToItinerary(itinerary);
      },
      () => {
        closeStreamRef.current = null;
        setGenerationError(true);
        void Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Error,
        );
      },
    );
  }, [matchId, navigateToItinerary]);

  const loadMatch = useCallback(async () => {
    if (!matchId) {
      setErrorKey("match.errors.invalid");
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorKey(null);
    try {
      const loaded = await getMatch(matchId);
      setMatch(loaded);
    } catch (error) {
      setErrorKey(
        error instanceof NetworkError
          ? "common.networkError"
          : error instanceof ApiError && error.status === 404
            ? "match.errors.invalid"
            : "match.errors.load",
      );
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  useEffect(() => {
    void loadMatch();
  }, [loadMatch]);

  useEffect(() => {
    if (!matchId || !canSubscribe) return;

    return onSnapshot(
      doc(db, "matches", matchId),
      (snapshot) => {
        if (!snapshot.exists()) {
          setErrorKey("match.errors.invalid");
          return;
        }
        setMatch({ id: snapshot.id, ...snapshot.data() } as MatchInDB);
      },
      () => setErrorKey("match.errors.realtime"),
    );
  }, [canSubscribe, matchId]);

  useEffect(() => {
    if (!match) return;

    if (
      previousStatusRef.current === "waiting" &&
      match.status === "generating"
    ) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }
    previousStatusRef.current = match.status;

    if (!fullMatch) return;

    if (
      fullMatch.status === "generating" &&
      isOwner &&
      fullMatch.generation_lock == null &&
      !generationAttemptedRef.current
    ) {
      startGeneration();
    }

    if (fullMatch.status === "completed" && fullMatch.itinerary) {
      navigateToItinerary(fullMatch.itinerary);
    }
  }, [fullMatch, isOwner, match, navigateToItinerary, startGeneration]);

  useEffect(() => {
    if (reduceMotion || !isOwner || fullMatch?.status !== "waiting") {
      pulse.value = 1;
      return;
    }
    pulse.value = withRepeat(
      withTiming(1.015, {
        duration: 1100,
        easing: Easing.bezier(0.77, 0, 0.175, 1),
      }),
      -1,
      true,
    );
  }, [fullMatch?.status, isOwner, pulse, reduceMotion]);

  useEffect(
    () => () => {
      closeStreamRef.current?.();
      closeStreamRef.current = null;
    },
    [],
  );

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  async function shareInvite(companion?: UserPublicProfile | null) {
    if (!matchId || !match) return;
    setErrorKey(null);
    const link = appDeepLink(`/match/${matchId}`);
    const friendName = companion?.name.trim();
    try {
      await Share.share({
        title: t("match.share.title"),
        message: friendName
          ? t("match.share.messageCompanion", {
              name: friendName,
              destination: match.destination,
              link,
            })
          : t("match.share.message", {
              destination: match.destination,
              link,
            }),
        url: link,
      });
    } catch {
      setErrorKey("match.errors.share");
    }
  }

  function inviteCompanion(companion: UserPublicProfile) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedCompanion(companion);
    void shareInvite(companion);
  }

  async function acceptInvite() {
    if (!matchId || joining) return;
    setJoining(true);
    setErrorKey(null);
    try {
      const joined = await joinMatch(matchId, { notes: guestNotes });
      setMatch(joined);
    } catch (error) {
      setErrorKey(
        error instanceof NetworkError
          ? "common.networkError"
          : error instanceof ApiError && error.status === 409
            ? "match.errors.full"
            : "match.errors.join",
      );
      void Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Error,
      );
    } finally {
      setJoining(false);
    }
  }

  function openEditVibe() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/edit-vibe");
  }

  function retryGeneration() {
    generationAttemptedRef.current = false;
    startGeneration();
  }

  if (loading) {
    return (
      <View
        style={[styles.root, { backgroundColor: theme.background }]}
        className="items-center justify-center gap-3"
      >
        <StatusBar style={scheme === "dark" ? "light" : "dark"} />
        <ActivityIndicator color={theme.accent} />
        <AppText tone="secondary">{t("common.loading")}</AppText>
      </View>
    );
  }

  if (!match || errorKey === "match.errors.invalid") {
    const invalidLink = errorKey === "match.errors.invalid";
    return (
      <View
        style={[
          styles.root,
          {
            backgroundColor: theme.background,
            paddingTop: insets.top + 16,
            paddingBottom: Math.max(insets.bottom, 24),
          },
        ]}
      >
        <StatusBar style={scheme === "dark" ? "light" : "dark"} />
        <View style={styles.errorState}>
          <Ionicons name="link-outline" size={44} color={theme.textMuted} />
          <AppText className="text-center text-[22px] font-bold">
            {t(
              invalidLink
                ? "match.invalid.title"
                : "match.unavailable.title",
            )}
          </AppText>
          <AppText tone="secondary" className="text-center text-[14px]">
            {t(
              invalidLink
                ? "match.invalid.body"
                : "match.unavailable.body",
            )}
          </AppText>
          <ActionButton
            onPress={() => void loadMatch()}
            accessibilityLabel={t("match.actions.retry")}
          >
            {t("match.actions.retry")}
          </ActionButton>
          <ActionButton
            onPress={() => router.replace("/(tabs)")}
            secondary
            accessibilityLabel={t("match.actions.home")}
          >
            {t("match.actions.home")}
          </ActionButton>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 8,
            borderBottomColor: theme.border,
          },
        ]}
      >
        <Pressable
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t("match.actions.back")}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          style={[styles.backButton, { backgroundColor: theme.surface }]}
        >
          <Ionicons name="arrow-back" size={22} color={theme.textPrimary} />
        </Pressable>
        <View className="flex-1">
          <AppText className="text-[18px] font-bold">
            {isGenerating
              ? t("match.generating.header")
              : t("match.lobby.header")}
          </AppText>
          <AppText tone="secondary" className="text-[12px]">
            {match.destination}
          </AppText>
        </View>
      </View>

      {isGenerating || fullMatch?.status === "completed" ? (
        <View style={styles.generatingArea}>
          <MagicalGenerating
            destination={match.destination}
            translationPrefix="match.generating"
          />
          {generationError && isOwner && (
            <Animated.View
              entering={FadeInDown.duration(180).easing(
                Easing.out(Easing.cubic),
              )}
              style={[
                styles.inlineNotice,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                  marginBottom: Math.max(insets.bottom, 16),
                },
              ]}
            >
              <AppText tone="error" className="text-center text-[13px]">
                {t("match.errors.generation")}
              </AppText>
              <ActionButton
                onPress={retryGeneration}
                secondary
                accessibilityLabel={t("match.actions.retry")}
              >
                {t("match.actions.retry")}
              </ActionButton>
            </Animated.View>
          )}
          {errorKey === "match.errors.realtime" && (
            <View
              style={[
                styles.inlineNotice,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                  marginBottom: Math.max(insets.bottom, 16),
                },
              ]}
            >
              <AppText tone="error" className="text-center text-[13px]">
                {t(errorKey)}
              </AppText>
            </View>
          )}
        </View>
      ) : (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: Math.max(insets.bottom, 24) },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.copy}>
            <AppText
              className="text-center text-[26px] font-bold"
              style={{ letterSpacing: -0.6 }}
            >
              {isOwner
                ? t("match.lobby.ownerTitle")
                : t("match.lobby.guestTitle")}
            </AppText>
            <AppText tone="secondary" className="text-center text-[14px]">
              {isOwner
                ? t("match.lobby.ownerSubtitle")
                : t("match.lobby.guestSubtitle")}
            </AppText>
          </View>

          <PairVisual left={pairSlots.left} right={pairSlots.right} />

          {showCompanionPicker ? (
            <View style={styles.companionsBlock}>
              <AppText className="text-[13px] font-semibold">
                {t("match.lobby.inviteFromFriends")}
              </AppText>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.companionsRow}
              >
                {companions.map((c) => {
                  const name =
                    c.name.trim() || t("profile.fallbackName");
                  const photo = profilePhotoUri({
                    photoBase64: c.photoBase64,
                  });
                  const selected = selectedCompanion?.uid === c.uid;
                  return (
                    <Pressable
                      key={c.uid}
                      onPress={() => inviteCompanion(c)}
                      style={[
                        styles.companionChip,
                        {
                          backgroundColor: theme.surface,
                          borderColor: selected
                            ? theme.accent
                            : theme.border,
                        },
                      ]}
                      accessibilityLabel={t(
                        "match.lobby.inviteCompanionA11y",
                        { name },
                      )}
                    >
                      {photo ? (
                        <Image
                          source={{ uri: photo }}
                          style={styles.companionChipPhoto}
                          contentFit="cover"
                        />
                      ) : (
                        <View
                          style={[
                            styles.companionChipPhoto,
                            {
                              backgroundColor: `${theme.accent}22`,
                              alignItems: "center",
                              justifyContent: "center",
                            },
                          ]}
                        >
                          <AppText tone="accent" className="text-[12px] font-bold">
                            {initials(name)}
                          </AppText>
                        </View>
                      )}
                      <AppText
                        className="text-[12px] font-semibold"
                        numberOfLines={1}
                        style={{ maxWidth: 72 }}
                      >
                        {name.split(/\s+/)[0]}
                      </AppText>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}

          <View
            style={[
              styles.summary,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <View style={styles.summaryItem}>
              <Ionicons name="location" size={19} color={theme.accent} />
              <View className="flex-1">
                <AppText tone="secondary" className="text-[11px]">
                  {t("match.summary.destination")}
                </AppText>
                <AppText className="text-[15px] font-semibold">
                  {match.destination}
                </AppText>
              </View>
            </View>
            <View style={styles.summaryItem}>
              <Ionicons name="calendar" size={19} color={theme.accent} />
              <View className="flex-1">
                <AppText tone="secondary" className="text-[11px]">
                  {t("match.summary.duration")}
                </AppText>
                <AppText className="text-[15px] font-semibold">
                  {(() => {
                    const start = match.start_date?.trim() || "";
                    const end = match.end_date?.trim() || "";
                    const span =
                      start && end ? formatTripDateSpan(start, end) : "";
                    if (span) {
                      return t("match.dateRange", {
                        range: span,
                        count: match.days,
                      });
                    }
                    return t("wizard.daysLabel", { count: match.days });
                  })()}
                </AppText>
              </View>
            </View>
            <View style={styles.summaryItem}>
              <Ionicons name="wallet" size={19} color={theme.accent} />
              <View className="flex-1">
                <AppText tone="secondary" className="text-[11px]">
                  {t("match.summary.budget")}
                </AppText>
                <AppText className="text-[15px] font-semibold">
                  {t(`onboarding.budget.${match.budget}`)}
                </AppText>
              </View>
            </View>
          </View>

          {isGuestLobby ? (
            <View style={styles.guestExtras}>
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
                <View
                  style={[
                    styles.vibeIcon,
                    { backgroundColor: `${theme.accent}18` },
                  ]}
                >
                  <Ionicons name="sparkles" size={18} color={theme.accent} />
                </View>
                <View style={styles.flex}>
                  <AppText className="text-[14px] font-semibold">
                    {t("match.lobby.reviewVibeTitle")}
                  </AppText>
                  <AppText tone="secondary" className="text-[12px]">
                    {t("match.lobby.reviewVibeHint")}
                  </AppText>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={theme.textSecondary}
                />
              </Pressable>

              <View style={styles.field}>
                <AppText className="text-[13px] font-semibold">
                  {t("match.lobby.guestNotesLabel")}
                </AppText>
                <TextInput
                  value={guestNotes}
                  onChangeText={setGuestNotes}
                  placeholder={t("match.lobby.guestNotesPlaceholder")}
                  placeholderTextColor={theme.textMuted}
                  multiline
                  textAlignVertical="top"
                  style={[
                    styles.notesInput,
                    {
                      color: theme.textPrimary,
                      backgroundColor: theme.surface,
                      borderColor: theme.border,
                    },
                  ]}
                />
              </View>
            </View>
          ) : null}

          {errorKey && (
            <AppText tone="error" className="text-center text-[13px]">
              {t(errorKey)}
            </AppText>
          )}

          <Animated.View style={isOwner ? pulseStyle : undefined}>
            <ActionButton
              onPress={
                isOwner
                  ? () => void shareInvite(selectedCompanion)
                  : () => void acceptInvite()
              }
              disabled={joining}
              accessibilityLabel={
                isOwner
                  ? t("match.actions.invite")
                  : t("match.actions.join")
              }
            >
              {joining
                ? t("match.actions.joining")
                : isOwner
                  ? t("match.actions.invite")
                  : t("match.actions.join")}
            </ActionButton>
          </Animated.View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 28,
    justifyContent: "space-between",
    gap: 20,
  },
  copy: { gap: 8 },
  pairRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  personColumn: {
    width: 120,
    alignItems: "center",
    gap: 8,
  },
  avatar: {
    width: 94,
    height: 94,
    borderRadius: 47,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  connection: {
    width: 54,
    height: 54,
    marginHorizontal: -8,
    zIndex: 1,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
  },
  companionsBlock: {
    gap: 10,
  },
  companionsRow: {
    gap: 10,
    paddingVertical: 2,
  },
  companionChip: {
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1.5,
    minWidth: 84,
  },
  companionChipPhoto: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  guestExtras: {
    gap: 14,
  },
  field: {
    gap: 8,
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
  notesInput: {
    minHeight: 88,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
  },
  summary: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    gap: 15,
  },
  summaryItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  actionButton: {
    minHeight: 56,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  generatingArea: { flex: 1 },
  inlineNotice: {
    marginHorizontal: 24,
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    gap: 10,
  },
  errorState: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 14,
  },
});
