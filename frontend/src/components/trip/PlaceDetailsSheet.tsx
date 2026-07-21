// Knowledge Panel do local — sheet Sobre + Comunidade (RF07).
// Física: sobe suave (240ms), fecha mais rápido (gravidade) — padrão CreateTripSheet.

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dimensions,
  FlatList,
  Linking,
  Modal,
  Alert,
  Pressable as RNPressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View as RNView,
} from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText } from "@/components/ui/AppText";
import { useTheme } from "@/hooks/use-theme";
import {
  deleteOwnPlaceReview,
  getPlaceFullDetails,
  getPlaceReviews,
  type PlaceFullDetailsResponse,
  type PlaceReviewResponse,
  upsertPlaceReview,
} from "@/lib/api";
import { auth } from "@/lib/firebase";
import {
  formatShortDate,
  isReviewEdited,
} from "@/lib/formatRelativeTime";

const ENTER = { duration: 240, easing: Easing.out(Easing.cubic) };
const DISMISS_MS = 180;
const DISMISS_Y = 100;
const PHOTO_H = 200;

type Tab = "about" | "community";

type Props = {
  placeId: string | null;
  onClose: () => void;
};

export function PlaceDetailsSheet({ placeId, onClose }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const open = placeId != null;

  const translateY = useSharedValue(400);
  const backdrop = useSharedValue(0);
  const shimmer = useSharedValue(0.45);

  const [tab, setTab] = useState<Tab>("about");
  const [details, setDetails] = useState<PlaceFullDetailsResponse | null>(null);
  const [reviews, setReviews] = useState<PlaceReviewResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  const sheetWidth = Dimensions.get("window").width;

  useEffect(() => {
    if (!open || !placeId) return;

    translateY.value = 400;
    backdrop.value = 0;
    translateY.value = withTiming(0, ENTER);
    backdrop.value = withTiming(1, {
      duration: 200,
      easing: Easing.out(Easing.quad),
    });

    setTab("about");
    setShowForm(false);
    setComment("");
    setRating(5);
    setError(false);
    setLoading(true);
    setDetails(null);

    const controller = new AbortController();
    let cancelled = false;

    (async () => {
      try {
        const [full, list] = await Promise.all([
          getPlaceFullDetails(placeId, controller.signal),
          getPlaceReviews(placeId, 20, controller.signal),
        ]);
        if (cancelled) return;
        setDetails(full);
        setReviews(list);
      } catch (err) {
        if (cancelled || controller.signal.aborted) return;
        console.warn("[PlaceDetailsSheet] falha ao carregar:", err);
        setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [open, placeId, translateY, backdrop]);

  useEffect(() => {
    if (!loading || reduceMotion) {
      shimmer.value = 0.5;
      return;
    }
    shimmer.value = withRepeat(
      withTiming(0.7, {
        duration: 900,
        easing: Easing.inOut(Easing.quad),
      }),
      -1,
      true,
    );
  }, [loading, reduceMotion, shimmer]);

  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: shimmer.value,
  }));

  function finishClose() {
    onClose();
  }

  function dismiss() {
    translateY.value = withTiming(500, { duration: DISMISS_MS }, (finished) => {
      if (finished) runOnJS(finishClose)();
    });
    backdrop.value = withTiming(0, { duration: 160 });
  }

  const pan = Gesture.Pan()
    .activeOffsetY(12)
    .failOffsetX([-20, 20])
    .onUpdate((e) => {
      if (e.translationY > 0) {
        translateY.value = e.translationY;
      }
    })
    .onEnd((e) => {
      if (e.translationY > DISMISS_Y || e.velocityY > 800) {
        runOnJS(dismiss)();
      } else {
        translateY.value = withTiming(0, ENTER);
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdrop.value * 0.5,
  }));

  const onSaveReview = useCallback(async () => {
    if (!placeId || saving) return;
    const trimmed = comment.trim();
    if (!trimmed) return;

    setSaving(true);
    try {
      await upsertPlaceReview(placeId, { rating, comment: trimmed });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const list = await getPlaceReviews(placeId, 20);
      setReviews(list);
      setShowForm(false);
      setComment("");
    } catch (err) {
      console.warn("[PlaceDetailsSheet] falha ao salvar review:", err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSaving(false);
    }
  }, [placeId, rating, comment, saving]);

  const ownUid = auth.currentUser?.uid ?? null;
  const ownReview =
    ownUid != null
      ? (reviews.find((r) => r.user_uid === ownUid) ?? null)
      : null;

  function openReviewForm(existing?: PlaceReviewResponse | null) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const source = existing ?? ownReview;
    if (source) {
      setRating(source.rating);
      setComment(source.comment);
    } else {
      setRating(5);
      setComment("");
    }
    setShowForm(true);
  }

  function toggleReviewForm() {
    if (showForm) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setShowForm(false);
      setComment("");
      setRating(5);
      return;
    }
    openReviewForm(ownReview);
  }

  function askDeleteOwnReview() {
    if (!placeId || !ownReview) return;
    Alert.alert(
      t("tripDetail.placeSheet.deleteReviewTitle"),
      t("tripDetail.placeSheet.deleteReviewBody"),
      [
        {
          text: t("tripDetail.placeSheet.deleteReviewCancel"),
          style: "cancel",
        },
        {
          text: t("tripDetail.placeSheet.deleteReviewConfirm"),
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await deleteOwnPlaceReview(placeId);
                Haptics.notificationAsync(
                  Haptics.NotificationFeedbackType.Success,
                );
                setReviews((prev) =>
                  prev.filter((r) => r.id !== ownReview.id),
                );
                setShowForm(false);
                setComment("");
                setRating(5);
              } catch (err) {
                console.warn("[PlaceDetailsSheet] falha ao excluir review:", err);
                Alert.alert(
                  t("tripDetail.placeSheet.deleteReviewTitle"),
                  t("tripDetail.placeSheet.deleteError"),
                );
              }
            })();
          },
        },
      ],
    );
  }

  return (
    <Modal
      visible={open}
      transparent
      animationType="none"
      onRequestClose={dismiss}
      statusBarTranslucent
    >
      <GestureHandlerRootView style={styles.fill}>
        <RNView style={[styles.fill, styles.end]}>
          <Animated.View style={[styles.backdrop, backdropStyle]}>
            <RNPressable style={styles.fill} onPress={dismiss} />
          </Animated.View>

          <GestureDetector gesture={pan}>
            <Animated.View
              style={[
                styles.sheet,
                sheetStyle,
                {
                  backgroundColor: theme.background,
                  maxHeight: "88%",
                  paddingBottom: Math.max(insets.bottom, 16) + 8,
                },
              ]}
            >
              <RNView style={styles.handleHit}>
                <RNView
                  style={[styles.handle, { backgroundColor: theme.textMuted }]}
                />
              </RNView>

              {/* Tabs */}
              <RNView style={styles.tabRow}>
                {(["about", "community"] as const).map((key) => {
                  const active = tab === key;
                  return (
                    <RNPressable
                      key={key}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setTab(key);
                      }}
                      style={[
                        styles.tabPill,
                        {
                          backgroundColor: active
                            ? theme.accent
                            : theme.surface,
                          borderColor: active ? theme.accent : theme.border,
                        },
                      ]}
                    >
                      <AppText
                        className="text-[13px] font-semibold"
                        style={{
                          color: active ? "#FFFFFF" : theme.textSecondary,
                        }}
                      >
                        {key === "about"
                          ? t("tripDetail.placeSheet.tabAbout")
                          : t("tripDetail.placeSheet.tabCommunity")}
                      </AppText>
                    </RNPressable>
                  );
                })}
              </RNView>

              <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
              >
                {loading ? (
                  <Animated.View
                    style={[
                      styles.shimmerBlock,
                      { backgroundColor: theme.border },
                      shimmerStyle,
                    ]}
                  />
                ) : error || !details ? (
                  <RNView style={styles.errorBox}>
                    <AppText className="text-[15px] font-semibold text-center">
                      {t("tripDetail.placeSheet.loadError")}
                    </AppText>
                    <RNPressable
                      onPress={dismiss}
                      style={[
                        styles.primaryBtn,
                        { backgroundColor: theme.buttonPrimary },
                      ]}
                    >
                      <AppText
                        className="text-[14px] font-semibold"
                        style={{ color: theme.buttonText }}
                      >
                        {t("tripDetail.close")}
                      </AppText>
                    </RNPressable>
                  </RNView>
                ) : tab === "about" ? (
                  <AboutTab
                    details={details}
                    sheetWidth={sheetWidth}
                    theme={theme}
                    t={t}
                  />
                ) : (
                  <CommunityTab
                    reviews={reviews}
                    ownUid={ownUid}
                    showForm={showForm}
                    isEditingOwn={ownReview != null}
                    rating={rating}
                    comment={comment}
                    saving={saving}
                    theme={theme}
                    t={t}
                    onToggleForm={toggleReviewForm}
                    onEditOwn={() => openReviewForm(ownReview)}
                    onDeleteOwn={askDeleteOwnReview}
                    onRating={setRating}
                    onComment={setComment}
                    onSave={onSaveReview}
                  />
                )}
              </ScrollView>
            </Animated.View>
          </GestureDetector>
        </RNView>
      </GestureHandlerRootView>
    </Modal>
  );
}

function AboutTab({
  details,
  sheetWidth,
  theme,
  t,
}: {
  details: PlaceFullDetailsResponse;
  sheetWidth: number;
  theme: ReturnType<typeof useTheme>;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const photos =
    details.photo_urls.length > 0 ? details.photo_urls : [null];

  return (
    <RNView style={styles.gap}>
      <FlatList
        data={photos}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(_, i) => `photo-${i}`}
        style={{ marginHorizontal: -20 }}
        renderItem={({ item }) => (
          <RNView style={{ width: sheetWidth, height: PHOTO_H }}>
            {item ? (
              <Image
                source={{ uri: item }}
                style={styles.photo}
                contentFit="cover"
              />
            ) : (
              <RNView
                style={[styles.photo, { backgroundColor: theme.surface }]}
              />
            )}
          </RNView>
        )}
      />

      <AppText
        className="text-[22px] font-bold"
        style={{ letterSpacing: -0.4 }}
      >
        {details.name ?? t("tripDetail.placeSheet.unnamed")}
      </AppText>

      <RNView style={styles.metaRow}>
        {details.rating != null ? (
          <RNView style={styles.metaChip}>
            <Ionicons name="star" size={14} color="#F5C518" />
            <AppText className="text-[13px] font-semibold">
              {details.rating.toFixed(1)}
            </AppText>
            {details.reviews_count != null && details.reviews_count > 0 ? (
              <AppText tone="muted" className="text-[12px]">
                ({details.reviews_count})
              </AppText>
            ) : null}
          </RNView>
        ) : null}
        {details.price_level ? (
          <RNView style={styles.metaChip}>
            <AppText className="text-[13px] font-semibold">
              {details.price_level}
            </AppText>
            <AppText tone="muted" className="text-[12px]">
              {t("tripDetail.placeSheet.priceLevel")}
            </AppText>
          </RNView>
        ) : null}
        {details.open_now === true ? (
          <AppText tone="success" className="text-[12px] font-semibold">
            {t("tripDetail.openNow")}
          </AppText>
        ) : details.open_now === false ? (
          <AppText tone="secondary" className="text-[12px]">
            {t("tripDetail.closedNow")}
          </AppText>
        ) : null}
      </RNView>

      {details.editorial_summary ? (
        <AppText tone="secondary" className="text-[14px] leading-5">
          {details.editorial_summary}
        </AppText>
      ) : null}

      {details.formatted_address ? (
        <RNView style={styles.rowIcon}>
          <Ionicons name="location-outline" size={16} color={theme.textMuted} />
          <AppText tone="secondary" className="text-[13px] flex-1">
            {details.formatted_address}
          </AppText>
        </RNView>
      ) : null}

      {details.phone ? (
        <RNView style={styles.rowIcon}>
          <Ionicons name="call-outline" size={16} color={theme.textMuted} />
          <AppText tone="secondary" className="text-[13px]">
            {details.phone}
          </AppText>
        </RNView>
      ) : null}

      {details.website ? (
        <RNView style={styles.rowIcon}>
          <Ionicons name="globe-outline" size={16} color={theme.textMuted} />
          <AppText tone="accent" className="text-[13px]" numberOfLines={1}>
            {details.website}
          </AppText>
        </RNView>
      ) : null}

      {details.menu_uri ? (
        <RNPressable
          onPress={() => {
            void Linking.openURL(details.menu_uri!);
          }}
          style={styles.rowIcon}
          accessibilityRole="link"
          accessibilityLabel={t("tripDetail.placeSheet.menu")}
        >
          <Ionicons
            name="restaurant-outline"
            size={16}
            color={theme.textMuted}
          />
          <AppText tone="accent" className="text-[13px] font-semibold">
            {t("tripDetail.placeSheet.menu")}
          </AppText>
        </RNPressable>
      ) : null}

      {details.weekday_text.length > 0 ? (
        <RNView style={styles.hoursBox}>
          <AppText className="text-[14px] font-semibold mb-1">
            {t("tripDetail.placeSheet.hours")}
          </AppText>
          {details.weekday_text.map((line) => (
            <AppText
              key={line}
              tone="secondary"
              className="text-[12px] leading-5"
            >
              {line}
            </AppText>
          ))}
        </RNView>
      ) : null}
    </RNView>
  );
}

function CommunityTab({
  reviews,
  ownUid,
  showForm,
  isEditingOwn,
  rating,
  comment,
  saving,
  theme,
  t,
  onToggleForm,
  onEditOwn,
  onDeleteOwn,
  onRating,
  onComment,
  onSave,
}: {
  reviews: PlaceReviewResponse[];
  ownUid: string | null;
  showForm: boolean;
  isEditingOwn: boolean;
  rating: number;
  comment: string;
  saving: boolean;
  theme: ReturnType<typeof useTheme>;
  t: (key: string) => string;
  onToggleForm: () => void;
  onEditOwn: () => void;
  onDeleteOwn: () => void;
  onRating: (n: number) => void;
  onComment: (s: string) => void;
  onSave: () => void;
}) {
  const writeLabel = showForm
    ? t("tripDetail.placeSheet.cancelReview")
    : isEditingOwn
      ? t("tripDetail.placeSheet.editReview")
      : t("tripDetail.placeSheet.writeReview");

  const saveLabel = saving
    ? t("tripDetail.placeSheet.saving")
    : isEditingOwn
      ? t("tripDetail.placeSheet.saveEdit")
      : t("tripDetail.placeSheet.saveReview");

  return (
    <RNView style={styles.gap}>
      <RNPressable
        onPress={onToggleForm}
        style={[
          styles.primaryBtn,
          { backgroundColor: theme.buttonPrimary },
        ]}
      >
        <AppText
          className="text-[14px] font-semibold"
          style={{ color: theme.buttonText }}
        >
          {writeLabel}
        </AppText>
      </RNPressable>

      {showForm ? (
        <RNView
          style={[
            styles.formBox,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <RNView style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((n) => (
              <RNPressable
                key={n}
                onPress={() => {
                  Haptics.selectionAsync();
                  onRating(n);
                }}
                hitSlop={6}
              >
                <Ionicons
                  name={n <= rating ? "star" : "star-outline"}
                  size={28}
                  color="#F5C518"
                />
              </RNPressable>
            ))}
          </RNView>
          <TextInput
            value={comment}
            onChangeText={onComment}
            placeholder={t("tripDetail.placeSheet.commentPlaceholder")}
            placeholderTextColor={theme.textMuted}
            multiline
            maxLength={500}
            style={[
              styles.commentInput,
              {
                color: theme.textPrimary,
                borderColor: theme.border,
                backgroundColor: theme.background,
              },
            ]}
          />
          <RNPressable
            onPress={onSave}
            disabled={saving || !comment.trim()}
            style={[
              styles.primaryBtn,
              {
                backgroundColor: theme.accent,
                opacity: saving || !comment.trim() ? 0.5 : 1,
              },
            ]}
          >
            <AppText
              className="text-[14px] font-semibold"
              style={{ color: "#FFFFFF" }}
            >
              {saveLabel}
            </AppText>
          </RNPressable>
        </RNView>
      ) : null}

      {reviews.length === 0 ? (
        <AppText tone="secondary" className="text-[13px] text-center py-4">
          {t("tripDetail.placeSheet.emptyReviews")}
        </AppText>
      ) : (
        reviews.map((r) => {
          const isOwn = ownUid != null && r.user_uid === ownUid;
          const dateLabel = formatShortDate(r.created_at);
          const edited = isReviewEdited(r.updated_at);

          return (
            <RNView
              key={r.id}
              style={[
                styles.reviewCard,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}
            >
              <RNView style={styles.reviewHeader}>
                <RNView style={styles.metaChip}>
                  <Ionicons name="star" size={12} color="#F5C518" />
                  <AppText className="text-[12px] font-semibold">
                    {r.rating}
                  </AppText>
                </RNView>

                <RNView style={styles.reviewMeta}>
                  {dateLabel ? (
                    <AppText tone="muted" className="text-[11px]">
                      {dateLabel}
                    </AppText>
                  ) : null}
                  {edited ? (
                    <AppText tone="muted" className="text-[11px]">
                      · {t("tripDetail.placeSheet.edited")}
                    </AppText>
                  ) : null}
                </RNView>

                {isOwn ? (
                  <RNView style={styles.reviewActions}>
                    <RNPressable
                      onPress={onEditOwn}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={t(
                        "tripDetail.placeSheet.editReviewA11y",
                      )}
                    >
                      <Ionicons
                        name="create-outline"
                        size={18}
                        color={theme.textSecondary}
                      />
                    </RNPressable>
                    <RNPressable
                      onPress={onDeleteOwn}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={t(
                        "tripDetail.placeSheet.deleteReviewA11y",
                      )}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={18}
                        color={theme.error}
                      />
                    </RNPressable>
                  </RNView>
                ) : null}
              </RNView>
              <AppText tone="secondary" className="text-[13px] leading-5">
                {r.comment}
              </AppText>
            </RNView>
          );
        })
      )}
    </RNView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  end: { justifyContent: "flex-end" },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#000",
  },
  sheet: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: "hidden",
  },
  handleHit: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 8,
  },
  handle: {
    width: 40,
    height: 5,
    borderRadius: 3,
  },
  tabRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  tabPill: {
    height: 32,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: { flexGrow: 0 },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 12,
  },
  gap: { gap: 12 },
  shimmerBlock: {
    height: 220,
    borderRadius: 16,
  },
  errorBox: { gap: 12, alignItems: "center", paddingVertical: 24 },
  photo: { width: "100%", height: "100%" },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  rowIcon: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  hoursBox: { gap: 2, marginTop: 4 },
  primaryBtn: {
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  formBox: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  starsRow: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
  },
  commentInput: {
    minHeight: 88,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 12,
    textAlignVertical: "top",
    fontSize: 14,
  },
  reviewCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 12,
    gap: 6,
  },
  reviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  reviewMeta: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexWrap: "wrap",
  },
  reviewActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
});
