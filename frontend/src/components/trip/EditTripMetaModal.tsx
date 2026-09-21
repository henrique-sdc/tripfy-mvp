// Modais mínimos: meta da viagem (título/resumo/notas) e título do dia.
// `destination` (lugar real) não é editável aqui — só o título de exibição.

import * as Haptics from "@/lib/haptics";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import { AppText } from "@/components/ui/AppText";
import { useTheme } from "@/hooks/use-theme";

function dismissThen(fn: () => void) {
  Keyboard.dismiss();
  fn();
}

/** Empurra o cartão acima do teclado iOS e deixa rolar até Salvar. */
function KeyboardModalCard({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const theme = useTheme();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.avoid}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => dismissThen(onClose)}
        >
          <Pressable
            style={[
              styles.card,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
            onPress={Keyboard.dismiss}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              bounces={false}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.cardInner}
            >
              {children}
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

type MetaProps = {
  visible: boolean;
  /** Título de exibição (fallback = place se vazio no pai). */
  initialTitle: string;
  /** Destino real — só leitura no modal. */
  place: string;
  initialSummary: string;
  initialNotes: string;
  onClose: () => void;
  onSave: (title: string, summary: string, notes: string) => void;
};

export function EditTripMetaModal({
  visible,
  initialTitle,
  place,
  initialSummary,
  initialNotes,
  onClose,
  onSave,
}: MetaProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [title, setTitle] = useState(initialTitle);
  const [summary, setSummary] = useState(initialSummary);
  const [notes, setNotes] = useState(initialNotes);

  useEffect(() => {
    if (visible) {
      setTitle(initialTitle);
      setSummary(initialSummary);
      setNotes(initialNotes);
    }
  }, [visible, initialTitle, initialSummary, initialNotes]);

  const canSave = title.trim().length > 0;

  function submit() {
    if (!canSave) return;
    Keyboard.dismiss();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSave(title.trim(), summary.trim(), notes.trim());
  }

  const fieldStyle = {
    color: theme.textPrimary,
    borderColor: theme.border,
    backgroundColor: theme.background,
  };

  return (
    <KeyboardModalCard visible={visible} onClose={onClose}>
      <AppText className="text-[18px] font-bold" style={{ letterSpacing: -0.3 }}>
        {t("tripDetail.editTrip.title")}
      </AppText>

      <AppText tone="secondary" className="text-[12px]">
        {t("tripDetail.editTrip.titleLabel")}
      </AppText>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder={t("tripDetail.editTrip.titlePlaceholder")}
        placeholderTextColor={theme.textMuted}
        maxLength={80}
        returnKeyType="next"
        style={[styles.input, fieldStyle]}
      />

      {place.trim() ? (
        <View style={styles.placeRow}>
          <AppText tone="muted" className="text-[12px]">
            {t("tripDetail.editTrip.placeLabel")}
          </AppText>
          <AppText tone="secondary" className="text-[13px]" numberOfLines={2}>
            {place.trim()}
          </AppText>
        </View>
      ) : null}

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
        style={[styles.input, styles.inputMultiline, fieldStyle]}
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
        style={[styles.input, styles.inputMultiline, fieldStyle]}
      />

      <View style={styles.actions}>
        <Pressable
          onPress={() => dismissThen(onClose)}
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
    </KeyboardModalCard>
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
    Keyboard.dismiss();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSave(title.trim());
  }

  return (
    <KeyboardModalCard visible={visible} onClose={onClose}>
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
        returnKeyType="done"
        onSubmitEditing={submit}
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
          onPress={() => dismissThen(onClose)}
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
    </KeyboardModalCard>
  );
}

const styles = StyleSheet.create({
  avoid: { flex: 1 },
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
    maxHeight: "85%",
  },
  cardInner: {
    gap: 8,
  },
  placeRow: {
    gap: 2,
    marginBottom: 8,
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
