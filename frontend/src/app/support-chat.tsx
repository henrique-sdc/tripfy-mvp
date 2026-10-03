// Chat de suporte — estado só na tela. Sair apaga a conversa.
// FlatList invertida cola o balão novo no rodapé sem scrollToEnd.

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText } from "@/components/ui/AppText";
import { useTheme } from "@/hooks/use-theme";
import { supportChatStream, type SupportChatTurn } from "@/lib/api";
import { Pressable, TextInput, View } from "@/tw";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  failed?: boolean;
};

function toTurns(items: ChatMessage[]): SupportChatTurn[] {
  return items
    .filter((item) => !item.failed && item.text.trim().length > 0)
    .map((item) => ({ role: item.role, content: item.text }));
}

export default function SupportChatScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const scheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const busy = useRef(false);
  const closeRef = useRef<(() => void) | null>(null);
  const seq = useRef(0);

  const listData = useMemo(() => [...messages].reverse(), [messages]);

  useEffect(() => {
    return () => closeRef.current?.();
  }, []);

  function nextId() {
    seq.current += 1;
    return `m${seq.current}`;
  }

  function begin(nextMessages: ChatMessage[], history: ChatMessage[]) {
    if (busy.current) return;
    const payload = toTurns(history);
    if (payload.length === 0 || payload[payload.length - 1]?.role !== "user") {
      return;
    }

    busy.current = true;
    setStreaming(true);
    setMessages(nextMessages);

    closeRef.current = supportChatStream(
      payload,
      (token) => {
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (last?.role !== "assistant" || last.failed) return prev;
          copy[copy.length - 1] = { ...last, text: last.text + token };
          return copy;
        });
      },
      () => {
        busy.current = false;
        setStreaming(false);
        closeRef.current = null;
      },
      () => {
        busy.current = false;
        setStreaming(false);
        closeRef.current = null;
        const errorText = t("supportChat.error");
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (last?.role !== "assistant") return prev;
          copy[copy.length - 1] = {
            ...last,
            text: last.text.trim() ? last.text : errorText,
            failed: true,
          };
          return copy;
        });
      },
    );
  }

  function send() {
    const trimmed = draft.trim();
    if (!trimmed || busy.current) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const kept = messages.filter((item) => !item.failed);
    const user: ChatMessage = { id: nextId(), role: "user", text: trimmed };
    const bot: ChatMessage = { id: nextId(), role: "assistant", text: "" };
    setDraft("");
    begin([...kept, user, bot], [...kept, user]);
  }

  function retry() {
    if (busy.current) return;
    const kept = messages.filter((item) => !item.failed && item.text.trim());
    const bot: ChatMessage = { id: nextId(), role: "assistant", text: "" };
    begin([...kept, bot], kept);
  }

  const canSend = draft.trim().length > 0 && !streaming;

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
          {t("supportChat.title")}
        </AppText>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {messages.length === 0 ? (
          <View className="flex-1 justify-end px-6 pb-4">
            <AppText tone="secondary" className="text-[15px] leading-6">
              {t("supportChat.empty")}
            </AppText>
          </View>
        ) : (
          <FlatList
            style={{ flex: 1 }}
            data={listData}
            inverted
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingVertical: 12,
            }}
            renderItem={({ item }) => (
              <Bubble
                message={item}
                typingLabel={t("supportChat.typing")}
                retryLabel={t("supportChat.retry")}
                errorLabel={t("supportChat.error")}
                onRetry={item.failed ? retry : undefined}
              />
            )}
          />
        )}

        <View
          className="flex-row items-end gap-2 px-4 pt-2"
          style={{ paddingBottom: insets.bottom + 8 }}
        >
          <View
            className="flex-1 rounded-2xl border px-3.5 py-2"
            style={{ backgroundColor: theme.surface, borderColor: theme.border }}
          >
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={t("supportChat.placeholder")}
              placeholderTextColor={theme.textMuted}
              multiline
              maxLength={800}
              style={{
                maxHeight: 120,
                fontSize: 16,
                color: theme.textPrimary,
                paddingVertical: 0,
              }}
            />
          </View>
          <Pressable
            onPress={send}
            disabled={!canSend}
            accessibilityLabel={t("supportChat.send")}
            className="w-11 h-11 rounded-full items-center justify-center"
            style={{
              backgroundColor: theme.accent,
              opacity: canSend ? 1 : 0.4,
            }}
          >
            <Ionicons name="arrow-up" size={20} color={theme.presenceText} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function Bubble({
  message,
  typingLabel,
  retryLabel,
  errorLabel,
  onRetry,
}: {
  message: ChatMessage;
  typingLabel: string;
  retryLabel: string;
  errorLabel: string;
  onRetry?: () => void;
}) {
  const theme = useTheme();
  const mine = message.role === "user";
  const waiting = !mine && !message.text && !message.failed;
  const body = waiting ? typingLabel : message.text;
  const showError = message.failed && message.text === errorLabel;

  return (
    <View className={`w-full mb-2 ${mine ? "items-end" : "items-start"}`}>
      <View
        className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl ${
          mine ? "rounded-br-md" : "rounded-bl-md border"
        }`}
        style={{
          backgroundColor: mine ? theme.accent : theme.surface,
          borderColor: theme.border,
        }}
      >
        <AppText
          selectable
          tone={showError ? "error" : "primary"}
          className="text-[15px] leading-5"
          style={mine ? { color: theme.presenceText } : undefined}
        >
          {body}
        </AppText>
      </View>
      {onRetry ? (
        <Pressable onPress={onRetry} hitSlop={8} className="mt-1.5">
          <AppText tone="accent" className="text-[13px] font-semibold">
            {retryLabel}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}
