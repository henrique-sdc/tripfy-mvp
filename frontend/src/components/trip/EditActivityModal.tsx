// Modal mínimo para editar horário, título, descrição e dia da parada (RF07).

import * as Haptics from "@/lib/haptics";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import { AppText } from "@/components/ui/AppText";
import { useTheme } from "@/hooks/use-theme";

export type DayOption = {
  day: number;
  title: string;
};

type Props = {
  visible: boolean;
  initialTime: string;
  initialTitle: string;
  initialDescription: string;
  /** Índice em `days` (0-based). */
  initialDayIndex: number;
  days: DayOption[];
  onClose: () => void;
  onSave: (
    time: string,
    title: string,
    description: string,
    dayIndex: number,
  ) => void;
};

export function EditActivityModal({
  visible,
  initialTime,
  initialTitle,
  initialDescription,
  initialDayIndex,
  days,
  onClose,
  onSave,
}: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [time, setTime] = useState(initialTime);
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [dayIndex, setDayIndex] = useState(initialDayIndex);

  useEffect(() => {
    if (visible) {
      setTime(initialTime);
      setTitle(initialTitle);
      setDescription(initialDescription);
      setDayIndex(initialDayIndex);
    }
  }, [
    visible,
    initialTime,
    initialTitle,
    initialDescription,
    initialDayIndex,
  ]);

  const canSave = title.trim().length > 0 && time.trim().length > 0;

  function submit() {
    if (!canSave) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSave(time.trim(), title.trim(), description.trim(), dayIndex);
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

          <AppText tone="secondary" className="text-[12px]">
            {t("tripDetail.editActivity.descriptionLabel")}
          </AppText>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder={t("tripDetail.editActivity.descriptionPlaceholder")}
            placeholderTextColor={theme.textMuted}
            maxLength={500}
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

          {days.length > 1 ? (
            <>
              <AppText tone="secondary" className="text-[12px]">
                {t("tripDetail.editActivity.dayLabel")}
              </AppText>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.dayChips}
              >
                {days.map((d, i) => {
                  const active = dayIndex === i;
                  return (
                    <Pressable
                      key={d.day}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setDayIndex(i);
                      }}
                      style={[
                        styles.dayChip,
                        {
                          backgroundColor: active
                            ? theme.accent
                            : theme.background,
                          borderColor: active ? theme.accent : theme.border,
                        },
                      ]}
                    >
                      <AppText
                        className="text-[12px] font-semibold"
                        style={{
                          color: active ? "#fff" : theme.textSecondary,
                        }}
                      >
                        {t("tripDetail.dayChip", { day: d.day })}
                      </AppText>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </>
          ) : null}

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
  inputMultiline: {
    height: 88,
    paddingTop: 10,
    paddingBottom: 10,
  },
  dayChips: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingBottom: 8,
  },
  dayChip: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
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
