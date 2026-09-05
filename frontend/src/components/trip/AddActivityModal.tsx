// Modal pra adicionar parada manual no dia atual (RF07).
// Endereço opcional → lookup Places → lat/lng pro mapa.

import * as Haptics from "@/lib/haptics";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import { AppText } from "@/components/ui/AppText";
import { useTheme } from "@/hooks/use-theme";
import { getPlaceDetails } from "@/lib/api";

export type NewActivityPayload = {
  time: string;
  title: string;
  description: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
};

type Props = {
  visible: boolean;
  /** Destino da viagem — melhora o geocode ("rua X, Lisboa"). */
  destination?: string;
  onClose: () => void;
  onSave: (payload: NewActivityPayload) => void;
};

export function AddActivityModal({
  visible,
  destination,
  onClose,
  onSave,
}: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [time, setTime] = useState("09:00");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    if (visible) {
      setTime("09:00");
      setTitle("");
      setDescription("");
      setAddress("");
      setResolving(false);
    }
  }, [visible]);

  const canSave =
    title.trim().length > 0 && time.trim().length > 0 && !resolving;

  async function submit() {
    if (!canSave) return;
    setResolving(true);

    const trimmedTitle = title.trim();
    const trimmedAddress = address.trim();
    let latitude: number | null = null;
    let longitude: number | null = null;
    const location = trimmedAddress || trimmedTitle;

    if (trimmedAddress) {
      try {
        // Destino no query reduz ambiguidade (ex.: "Praça do Comércio, Lisboa").
        const query = destination?.trim()
          ? `${trimmedAddress}, ${destination.trim()}`
          : trimmedAddress;
        const details = await getPlaceDetails(query);
        if (
          typeof details.latitude === "number" &&
          typeof details.longitude === "number" &&
          Number.isFinite(details.latitude) &&
          Number.isFinite(details.longitude)
        ) {
          latitude = details.latitude;
          longitude = details.longitude;
        }
      } catch (err) {
        // Sem pin — parada ainda salva; card pode enriquecer depois.
        console.warn("[AddActivityModal] Geocode falhou:", err);
      }
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSave({
      time: time.trim(),
      title: trimmedTitle,
      description: description.trim(),
      location,
      latitude,
      longitude,
    });
    setResolving(false);
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.card,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <AppText className="text-[18px] font-bold" style={{ letterSpacing: -0.3 }}>
            {t("tripDetail.addActivity.title")}
          </AppText>

          <AppText tone="secondary" className="text-[12px]">
            {t("tripDetail.addActivity.timeLabel")}
          </AppText>
          <TextInput
            value={time}
            onChangeText={setTime}
            placeholder="09:00"
            placeholderTextColor={theme.textMuted}
            maxLength={8}
            editable={!resolving}
            style={[
              styles.input,
              {
                color: theme.textPrimary,
                borderColor: theme.border,
                backgroundColor: theme.background,
              },
            ]}
          />

          <AppText tone="secondary" className="text-[12px]">
            {t("tripDetail.addActivity.nameLabel")}
          </AppText>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder={t("tripDetail.addActivity.namePlaceholder")}
            placeholderTextColor={theme.textMuted}
            maxLength={120}
            editable={!resolving}
            style={[
              styles.input,
              {
                color: theme.textPrimary,
                borderColor: theme.border,
                backgroundColor: theme.background,
              },
            ]}
          />

          <AppText tone="secondary" className="text-[12px]">
            {t("tripDetail.addActivity.addressLabel")}
          </AppText>
          <TextInput
            value={address}
            onChangeText={setAddress}
            placeholder={t("tripDetail.addActivity.addressPlaceholder")}
            placeholderTextColor={theme.textMuted}
            maxLength={200}
            editable={!resolving}
            style={[
              styles.input,
              {
                color: theme.textPrimary,
                borderColor: theme.border,
                backgroundColor: theme.background,
              },
            ]}
          />
          <AppText tone="muted" className="text-[11px]" style={styles.hint}>
            {t("tripDetail.addActivity.addressHint")}
          </AppText>

          <AppText tone="secondary" className="text-[12px]">
            {t("tripDetail.addActivity.descriptionLabel")}
          </AppText>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder={t("tripDetail.addActivity.descriptionPlaceholder")}
            placeholderTextColor={theme.textMuted}
            maxLength={500}
            multiline
            editable={!resolving}
            textAlignVertical="top"
            style={[
              styles.input,
              styles.inputMultiline,
              {
                color: theme.textPrimary,
                borderColor: theme.border,
                backgroundColor: theme.background,
              },
            ]}
          />

          <View style={styles.actions}>
            <Pressable
              onPress={onClose}
              disabled={resolving}
              style={[styles.btn, { borderColor: theme.border }]}
            >
              <AppText tone="secondary" className="text-[14px] font-semibold">
                {t("tripDetail.addActivity.cancel")}
              </AppText>
            </Pressable>
            <Pressable
              onPress={() => void submit()}
              disabled={!canSave}
              style={[
                styles.btn,
                styles.btnPrimary,
                {
                  backgroundColor: theme.buttonPrimary,
                  opacity: canSave ? 1 : 0.45,
                },
              ]}
            >
              {resolving ? (
                <ActivityIndicator color={theme.buttonText} />
              ) : (
                <AppText
                  className="text-[14px] font-semibold"
                  style={{ color: theme.buttonText }}
                >
                  {t("tripDetail.addActivity.save")}
                </AppText>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  card: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 20,
    gap: 8,
  },
  input: {
    height: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 15,
    marginBottom: 8,
  },
  inputMultiline: {
    height: 88,
    paddingTop: 10,
    paddingBottom: 10,
  },
  hint: {
    marginTop: -4,
    marginBottom: 4,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  btn: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },
  btnPrimary: {
    borderWidth: 0,
  },
});
