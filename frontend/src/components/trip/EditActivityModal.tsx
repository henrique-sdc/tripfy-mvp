// Modal mínimo para editar horário e título de uma parada (RF07).

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

type Props = {
  visible: boolean;
  initialTime: string;
  initialTitle: string;
  onClose: () => void;
  onSave: (time: string, title: string) => void;
};

export function EditActivityModal({
  visible,
  initialTime,
  initialTitle,
  onClose,
  onSave,
}: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [time, setTime] = useState(initialTime);
  const [title, setTitle] = useState(initialTitle);

  useEffect(() => {
    if (visible) {
      setTime(initialTime);
      setTitle(initialTitle);
    }
  }, [visible, initialTime, initialTitle]);

  const canSave = title.trim().length > 0 && time.trim().length > 0;

  function submit() {
    if (!canSave) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSave(time.trim(), title.trim());
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
            {t("tripDetail.editActivity.title")}
          </AppText>

          <AppText tone="secondary" className="text-[12px]">
            {t("tripDetail.editActivity.timeLabel")}
          </AppText>
          <TextInput
            value={time}
            onChangeText={setTime}
            placeholder="09:00"
            placeholderTextColor={theme.textMuted}
            maxLength={8}
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
            {t("tripDetail.editActivity.nameLabel")}
          </AppText>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder={t("tripDetail.editActivity.namePlaceholder")}
            placeholderTextColor={theme.textMuted}
            maxLength={120}
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
                {t("tripDetail.editActivity.cancel")}
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
                {t("tripDetail.editActivity.save")}
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
