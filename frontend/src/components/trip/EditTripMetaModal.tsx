// Modais mínimos: meta da viagem (destino/resumo/notas) e título do dia.

import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import { AppText } from "@/components/ui/AppText";
import { useTheme } from "@/hooks/use-theme";

type MetaProps = {
  visible: boolean;
  initialDestination: string;
  initialSummary: string;
  initialNotes: string;
  onClose: () => void;
  onSave: (destination: string, summary: string, notes: string) => void;
};

export function EditTripMetaModal({
  visible,
  initialDestination,
  initialSummary,
  initialNotes,
  onClose,
  onSave,
}: MetaProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [destination, setDestination] = useState(initialDestination);
  const [summary, setSummary] = useState(initialSummary);
  const [notes, setNotes] = useState(initialNotes);

  useEffect(() => {
    if (visible) {
      setDestination(initialDestination);
      setSummary(initialSummary);
      setNotes(initialNotes);
    }
  }, [visible, initialDestination, initialSummary, initialNotes]);

  const canSave = destination.trim().length > 0;

  function submit() {
    if (!canSave) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSave(destination.trim(), summary.trim(), notes.trim());
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
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
            {t("tripDetail.editTrip.title")}
          </AppText>

          <AppText tone="secondary" className="text-[12px]">
            {t("tripDetail.editTrip.destinationLabel")}
          </AppText>
          <TextInput
            value={destination}
            onChangeText={setDestination}
            placeholder={t("tripDetail.editTrip.destinationPlaceholder")}
            placeholderTextColor={theme.textMuted}
            maxLength={80}
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
            {t("tripDetail.editTrip.summaryLabel")}
          </AppText>
          <TextInput
            value={summary}
            onChangeText={setSummary}
            placeholder={t("tripDetail.editTrip.summaryPlaceholder")}
            placeholderTextColor={theme.textMuted}
            maxLength={400}
            multiline
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

          <AppText tone="secondary" className="text-[12px]">
            {t("tripDetail.editTrip.notesLabel")}
          </AppText>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder={t("tripDetail.editTrip.notesPlaceholder")}
            placeholderTextColor={theme.textMuted}
            maxLength={1000}
            multiline
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
              style={[styles.btn, { borderColor: theme.border }]}
            >
              <AppText tone="secondary" className="text-[14px] font-semibold">
                {t("tripDetail.editTrip.cancel")}
              </AppText>
            </Pressable>
            <Pressable
              onPress={submit}
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
              <AppText
                className="text-[14px] font-semibold"
                style={{ color: theme.buttonText }}
              >
                {t("tripDetail.editTrip.save")}
              </AppText>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

type DayTitleProps = {
  visible: boolean;
  dayNumber: number;
  initialTitle: string;
  onClose: () => void;
  onSave: (title: string) => void;
};

/** Só o tema do dia — toque no título em trip-detail. */
export function EditDayTitleModal({
  visible,
  dayNumber,
  initialTitle,
  onClose,
  onSave,
}: DayTitleProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [title, setTitle] = useState(initialTitle);

  useEffect(() => {
    if (visible) setTitle(initialTitle);
  }, [visible, initialTitle]);

  const canSave = title.trim().length > 0;

  function submit() {
    if (!canSave) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSave(title.trim());
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
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
            {t("tripDetail.editDayTitle.title", { day: dayNumber })}
          </AppText>

          <AppText tone="secondary" className="text-[12px]">
            {t("tripDetail.editDayTitle.label")}
          </AppText>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder={t("tripDetail.editDayTitle.placeholder")}
            placeholderTextColor={theme.textMuted}
            maxLength={80}
            autoFocus
            style={[
              styles.input,
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
              style={[styles.btn, { borderColor: theme.border }]}
            >
              <AppText tone="secondary" className="text-[14px] font-semibold">
                {t("tripDetail.editTrip.cancel")}
              </AppText>
            </Pressable>
            <Pressable
              onPress={submit}
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
              <AppText
                className="text-[14px] font-semibold"
                style={{ color: theme.buttonText }}
              >
                {t("tripDetail.editTrip.save")}
              </AppText>
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
    height: 96,
    paddingTop: 10,
    paddingBottom: 10,
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
