// Lista de alterações. Os dados já estão no roteiro — este sheet não busca nada.

import { useTranslation } from "react-i18next";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { AppText } from "@/components/ui/AppText";
import { useTheme } from "@/hooks/use-theme";
import type { ChangeEntry } from "@/lib/changeLog";
import { relativeTimeParts } from "@/lib/formatRelativeTime";

type Props = {
  visible: boolean;
  entries: ChangeEntry[];
  onClose: () => void;
};

const NOTICE_KIND: Record<string, string> = {
  day_title: "dayTitle",
};

function noticeKind(kind: string): string {
  return NOTICE_KIND[kind] ?? kind;
}

export function ChangeLogSheet({ visible, entries, onClose }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const newest = [...entries].reverse();

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
          onPress={() => {}}
        >
          <AppText className="text-[18px] font-bold" style={{ letterSpacing: -0.3 }}>
            {t("tripDetail.history.title")}
          </AppText>
          {newest.length === 0 ? (
            <AppText tone="secondary" className="text-[14px]">
              {t("tripDetail.history.empty")}
            </AppText>
          ) : (
            <ScrollView
              style={styles.list}
              showsVerticalScrollIndicator={false}
            >
              {newest.map((entry, index) => {
                const who =
                  entry.by.trim().split(/\s+/)[0] ||
                  t("tripDetail.presence.someone");
                const phrase = t(`tripDetail.collab.notice.${noticeKind(entry.kind)}`, {
                  name: who,
                  day: entry.day ?? "",
                });
                const parts = relativeTimeParts(entry.at_ms);
                const when = parts
                  ? parts.key === "trips.relative.today"
                    ? t(parts.key)
                    : t(parts.key, { count: parts.count })
                  : "";
                return (
                  <View
                    key={`${entry.at_ms}-${entry.kind}-${index}`}
                    style={[
                      styles.row,
                      index > 0 ? { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth } : null,
                    ]}
                  >
                    <AppText className="text-[14px] font-semibold">{phrase}</AppText>
                    {when ? (
                      <AppText tone="muted" className="text-[12px]">
                        {when}
                      </AppText>
                    ) : null}
                  </View>
                );
              })}
            </ScrollView>
          )}
          <Pressable
            onPress={onClose}
            style={[styles.close, { backgroundColor: theme.buttonPrimary }]}
            accessibilityRole="button"
          >
            <AppText
              className="text-[14px] font-semibold"
              style={{ color: theme.buttonText }}
            >
              {t("tripDetail.history.close")}
            </AppText>
          </Pressable>
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
    gap: 12,
    maxHeight: "70%",
  },
  list: {
    flexGrow: 0,
  },
  row: {
    paddingVertical: 10,
    gap: 2,
  },
  close: {
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
});
