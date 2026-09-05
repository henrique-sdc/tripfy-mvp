// Minhas Avaliações — lista, edita e apaga reviews do usuário (Fase 3).

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import { router, useFocusEffect } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable as RNPressable,
  TextInput,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText } from "@/components/ui/AppText";
import { PlaceDetailsSheet } from "@/components/trip/PlaceDetailsSheet";
import { useTheme } from "@/hooks/use-theme";
import {
  deleteOwnPlaceReview,
  getMyPlaceReviews,
  getPlaceFullDetails,
  type PlaceReviewResponse,
  upsertPlaceReview,
} from "@/lib/api";
import {
  formatShortDate,
  isReviewEdited,
} from "@/lib/formatRelativeTime";
import {
  looksLikeStreetPlaceName,
  resolvePlaceTitle,
  type PlaceFallback,
} from "@/lib/placeDisplay";
import { Pressable, ScrollView, View } from "@/tw";

/** Reviews antigas sem place_name (ou com endereço como nome) — resolve via Places. */
async function withPlaceNames(
  items: PlaceReviewResponse[],
): Promise<PlaceReviewResponse[]> {
  return Promise.all(
    items.map(async (review) => {
      const stored = review.place_name?.trim() || "";
      if (stored && !looksLikeStreetPlaceName(stored)) return review;
      try {
        const details = await getPlaceFullDetails(review.place_id);
        const name = resolvePlaceTitle({
          placesName: details.name,
          formattedAddress: details.formatted_address,
          fallbackTitle: stored && !looksLikeStreetPlaceName(stored) ? stored : null,
        });
        if (!name || looksLikeStreetPlaceName(name)) {
          // Limpa nome-rua salvo pra UI cair em unknownPlace.
          return { ...review, place_name: "" };
        }
        return { ...review, place_name: name };
      } catch (err) {
        console.warn(
          "[my-reviews] nome do lugar indisponível:",
          review.place_id,
          err,
        );
        if (stored && looksLikeStreetPlaceName(stored)) {
          return { ...review, place_name: "" };
        }
        return review;
      }
    }),
  );
}

export default function MyReviewsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const scheme = useColorScheme();
  const insets = useSafeAreaInsets();

  const [reviews, setReviews] = useState<PlaceReviewResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolvingNames, setResolvingNames] = useState(false);
  const [editing, setEditing] = useState<PlaceReviewResponse | null>(null);
  const [editRating, setEditRating] = useState(5);
  const [editComment, setEditComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [detailsPlace, setDetailsPlace] = useState<{
    placeId: string;
    fallback: PlaceFallback;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getMyPlaceReviews();
      // Mostra a lista cedo; nomes faltantes chegam em seguida.
      setReviews(data);
      setLoading(false);
      setResolvingNames(true);
      const named = await withPlaceNames(data);
      setReviews(named);
      setResolvingNames(false);
    } catch (err) {
      console.error("[my-reviews] Falha ao listar:", err);
      Alert.alert(t("myReviews.loadErrorTitle"), t("myReviews.loadErrorBody"));
      setLoading(false);
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  function openEdit(review: PlaceReviewResponse) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditing(review);
    setEditRating(review.rating);
    setEditComment(review.comment);
  }

  function openPlaceSheet(review: PlaceReviewResponse) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const raw = review.place_name?.trim() || "";
    const title =
      raw && !looksLikeStreetPlaceName(raw)
        ? raw
        : t("myReviews.unknownPlace");
    setDetailsPlace({
      placeId: review.place_id,
      fallback: { title },
    });
  }

  async function saveEdit() {
    if (!editing || !editComment.trim()) return;
    setSaving(true);
    try {
      let placeName = editing.place_name?.trim() || "";
      if (!placeName || looksLikeStreetPlaceName(placeName)) {
        try {
          const details = await getPlaceFullDetails(editing.place_id);
          placeName = resolvePlaceTitle({
            placesName: details.name,
            formattedAddress: details.formatted_address,
            fallbackTitle:
              placeName && !looksLikeStreetPlaceName(placeName)
                ? placeName
                : null,
          });
        } catch {
          // Mantém vazio — UI usa unknownPlace.
        }
      }
      if (placeName && looksLikeStreetPlaceName(placeName)) placeName = "";
      const updated = await upsertPlaceReview(editing.place_id, {
        rating: editRating,
        comment: editComment.trim(),
        place_name: placeName || undefined,
      });
      setReviews((prev) =>
        prev.map((r) =>
          r.id === updated.id
            ? {
                ...updated,
                place_name: updated.place_name?.trim() || placeName || r.place_name,
              }
            : r,
        ),
      );
      setEditing(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      console.error("[my-reviews] Upsert falhou:", err);
      Alert.alert(t("myReviews.saveErrorTitle"), t("myReviews.saveErrorBody"));
    } finally {
      setSaving(false);
    }
  }

  function askDelete(review: PlaceReviewResponse) {
    Alert.alert(t("myReviews.deleteTitle"), t("myReviews.deleteBody"), [
      { text: t("myReviews.cancel"), style: "cancel" },
      {
        text: t("myReviews.deleteConfirm"),
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              await deleteOwnPlaceReview(review.place_id);
              setReviews((prev) => prev.filter((r) => r.id !== review.id));
              Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Success,
              );
            } catch (err) {
              console.error("[my-reviews] Delete falhou:", err);
              Alert.alert(
                t("myReviews.saveErrorTitle"),
                t("myReviews.saveErrorBody"),
              );
            }
          })();
        },
      },
    ]);
  }

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
          {t("myReviews.title")}
        </AppText>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingBottom: insets.bottom + 32,
          gap: 12,
        }}
      >
        <AppText tone="secondary" className="text-[13px] leading-5 mb-2">
          {t("myReviews.subtitle")}
        </AppText>

        {loading ? (
          <ActivityIndicator color={theme.accent} style={{ marginTop: 24 }} />
        ) : reviews.length === 0 ? (
          <View className="items-center gap-2 mt-10 px-4">
            <Ionicons name="star-outline" size={36} color={theme.textMuted} />
            <AppText className="text-[16px] font-semibold text-center">
              {t("myReviews.emptyTitle")}
            </AppText>
            <AppText tone="secondary" className="text-[13px] text-center">
              {t("myReviews.emptyBody")}
            </AppText>
          </View>
        ) : (
          reviews.map((review) => {
            const dateLabel = formatShortDate(review.created_at);
            const edited = isReviewEdited(review.updated_at);
            const rawName = review.place_name?.trim() || "";
            const placeLabel =
              rawName && !looksLikeStreetPlaceName(rawName) ? rawName : "";
            const showResolving =
              !placeLabel &&
              resolvingNames &&
              (!rawName || looksLikeStreetPlaceName(rawName));

            return (
            <Pressable
              key={review.id}
              onPress={() => openPlaceSheet(review)}
              accessibilityRole="button"
              accessibilityLabel={t("myReviews.openPlaceA11y", {
                place: placeLabel || t("myReviews.unknownPlace"),
              })}
              className="rounded-3xl border p-4 gap-2"
              style={{
                backgroundColor: theme.surface,
                borderColor: theme.border,
              }}
            >
              <View className="flex-row items-center gap-2">
                <View
                  className="w-9 h-9 rounded-full items-center justify-center"
                  style={{ backgroundColor: `${theme.accent}18` }}
                >
                  <Ionicons
                    name="location"
                    size={18}
                    color={theme.accent}
                  />
                </View>
                {placeLabel ? (
                  <AppText
                    className="text-[16px] font-bold flex-1"
                    numberOfLines={2}
                    style={{ letterSpacing: -0.2 }}
                  >
                    {placeLabel}
                  </AppText>
                ) : showResolving ? (
                  <AppText tone="muted" className="text-[14px] flex-1">
                    {t("myReviews.resolvingPlace")}
                  </AppText>
                ) : (
                  <AppText
                    className="text-[16px] font-bold flex-1"
                    numberOfLines={2}
                    style={{ letterSpacing: -0.2 }}
                  >
                    {t("myReviews.unknownPlace")}
                  </AppText>
                )}
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={theme.textMuted}
                />
              </View>
              <View className="flex-row items-center gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Ionicons
                    key={i}
                    name={i < review.rating ? "star" : "star-outline"}
                    size={14}
                    color="#F5C518"
                  />
                ))}
              </View>
              <AppText className="text-[14px] leading-5">{review.comment}</AppText>
              {(dateLabel || edited) ? (
                <View className="flex-row items-center gap-1">
                  {dateLabel ? (
                    <AppText tone="muted" className="text-[11px]">
                      {dateLabel}
                    </AppText>
                  ) : null}
                  {edited ? (
                    <AppText tone="muted" className="text-[11px]">
                      · {t("myReviews.edited")}
                    </AppText>
                  ) : null}
                </View>
              ) : null}
              <View className="flex-row gap-2 mt-1">
                <Pressable
                  onPress={() => openEdit(review)}
                  className="flex-1 h-10 rounded-full items-center justify-center border"
                  style={{ borderColor: theme.border }}
                >
                  <AppText
                    tone="secondary"
                    className="text-[13px] font-semibold"
                  >
                    {t("myReviews.edit")}
                  </AppText>
                </Pressable>
                <Pressable
                  onPress={() => askDelete(review)}
                  className="flex-1 h-10 rounded-full items-center justify-center border"
                  style={{ borderColor: theme.error }}
                >
                  <AppText
                    className="text-[13px] font-semibold"
                    style={{ color: theme.error }}
                  >
                    {t("myReviews.delete")}
                  </AppText>
                </Pressable>
              </View>
            </Pressable>
            );
          })
        )}
      </ScrollView>

      <Modal
        visible={editing != null}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setEditing(null)}
      >
        <RNPressable
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.45)",
            justifyContent: "center",
            paddingHorizontal: 24,
          }}
          onPress={() => setEditing(null)}
        >
          <RNPressable
            onPress={(e) => e.stopPropagation()}
            style={{
              borderRadius: 20,
              borderWidth: 1,
              borderColor: theme.border,
              backgroundColor: theme.surface,
              padding: 20,
              gap: 10,
            }}
          >
            <AppText className="text-[18px] font-bold">
              {t("myReviews.editTitle")}
            </AppText>
            {(() => {
              const editName = editing?.place_name?.trim() || "";
              if (!editName || looksLikeStreetPlaceName(editName)) return null;
              return (
                <AppText tone="secondary" className="text-[13px]">
                  {editName}
                </AppText>
              );
            })()}
            <View className="flex-row gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <RNPressable
                  key={n}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setEditRating(n);
                  }}
                  hitSlop={6}
                >
                  <Ionicons
                    name={n <= editRating ? "star" : "star-outline"}
                    size={28}
                    color="#F5C518"
                  />
                </RNPressable>
              ))}
            </View>
            <TextInput
              value={editComment}
              onChangeText={setEditComment}
              multiline
              maxLength={500}
              placeholder={t("tripDetail.placeSheet.commentPlaceholder")}
              placeholderTextColor={theme.textMuted}
              style={{
                minHeight: 88,
                borderWidth: 1,
                borderColor: theme.border,
                borderRadius: 12,
                padding: 12,
                color: theme.textPrimary,
                backgroundColor: theme.background,
                textAlignVertical: "top",
              }}
            />
            <View className="flex-row gap-2 mt-1">
              <RNPressable
                onPress={() => setEditing(null)}
                style={{
                  flex: 1,
                  height: 44,
                  borderRadius: 22,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: theme.border,
                }}
              >
                <AppText tone="secondary" className="text-[14px] font-semibold">
                  {t("myReviews.cancel")}
                </AppText>
              </RNPressable>
              <RNPressable
                onPress={() => void saveEdit()}
                disabled={saving || !editComment.trim()}
                style={{
                  flex: 1,
                  height: 44,
                  borderRadius: 22,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: theme.buttonPrimary,
                  opacity: saving || !editComment.trim() ? 0.45 : 1,
                }}
              >
                <AppText
                  className="text-[14px] font-semibold"
                  style={{ color: theme.buttonText }}
                >
                  {t("myReviews.save")}
                </AppText>
              </RNPressable>
            </View>
          </RNPressable>
        </RNPressable>
      </Modal>

      <PlaceDetailsSheet
        placeId={detailsPlace?.placeId ?? null}
        fallback={detailsPlace?.fallback ?? null}
        initialTab="community"
        onClose={() => {
          setDetailsPlace(null);
          // Sync se editou/apagou review dentro do sheet.
          void load();
        }}
      />
    </View>
  );
}
