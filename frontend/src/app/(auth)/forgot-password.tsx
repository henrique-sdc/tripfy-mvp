// Recuperação de senha (RF02). Firebase envia o e-mail; o backend nunca vê a senha.
// Mesmo padrão de login/cadastro: RHF + Zod, AppText, erros via getAuthErrorKey.

import { zodResolver } from "@hookform/resolvers/zod";
import { sendPasswordResetEmail } from "firebase/auth";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as z from "zod";

import { AppText } from "@/components/ui/AppText";
import { AuthLink } from "@/components/ui/AuthLink";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useTheme } from "@/hooks/use-theme";
import { getAuthErrorKey } from "@/lib/auth-errors";
import { auth } from "@/lib/firebase";
import { View } from "@/tw";

const forgotSchema = z.object({
  email: z
    .string()
    .min(1, "auth.errors.emailRequired")
    .email("auth.errors.invalidEmail"),
});

type ForgotFormData = z.infer<typeof forgotSchema>;

export default function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotFormData>({
    resolver: zodResolver(forgotSchema),
    mode: "onBlur",
    defaultValues: { email: "" },
  });

  async function onSubmit(data: ForgotFormData) {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await sendPasswordResetEmail(auth, data.email.trim());
      setSuccess(true);
    } catch (error) {
      setSubmitError(getAuthErrorKey(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.background }}
        contentContainerStyle={{
          paddingTop: insets.top + 48,
          paddingBottom: insets.bottom + 32,
          paddingHorizontal: 24,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-10">
          <View className="gap-2">
            <AppText className="text-[32px] font-bold tracking-tight">
              {t("auth.forgotPasswordTitle")}
            </AppText>
            <AppText tone="secondary" className="text-[16px] leading-[24px]">
              {success
                ? t("auth.forgotPasswordSuccessHint")
                : t("auth.forgotPasswordDescription")}
            </AppText>
          </View>

          <View className="gap-5">
            {!success ? (
              <Animated.View
                key="forgot-form"
                exiting={FadeOut.duration(180)}
              >
                <Controller
                  control={control}
                  name="email"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <Input
                      label={t("auth.emailLabel")}
                      placeholder={t("auth.emailPlaceholder")}
                      icon="mail-outline"
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      autoCapitalize="none"
                      keyboardType="email-address"
                      autoComplete="email"
                      editable={!submitting}
                      error={
                        errors.email?.message
                          ? t(errors.email.message)
                          : undefined
                      }
                    />
                  )}
                />
              </Animated.View>
            ) : (
              <Animated.View
                key="forgot-success"
                entering={FadeIn.duration(220)}
              >
                <AppText
                  tone="success"
                  className="text-[15px] font-medium leading-6"
                >
                  {t("auth.forgotPasswordSuccess")}
                </AppText>
              </Animated.View>
            )}

            {submitError && !success && (
              <AppText
                tone="error"
                className="text-[14px] font-medium text-center"
              >
                {t(submitError)}
              </AppText>
            )}
          </View>

          <View className="gap-6 mt-2">
            <Button
              onPress={handleSubmit(onSubmit)}
              loading={submitting}
              disabled={success}
            >
              {submitting
                ? t("auth.forgotPasswordSubmitting")
                : t("auth.forgotPasswordSubmit")}
            </Button>

            <View className="items-center">
              <AuthLink href="/login" className="text-[15px] font-bold">
                {t("auth.forgotPasswordBack")}
              </AuthLink>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
