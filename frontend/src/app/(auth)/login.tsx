// Tela de login (RF01). Firebase Auth no frontend — backend nunca recebe senha.
// Google Sign-In adiado (exige dev client); botão social permanece desabilitado.

import { zodResolver } from "@hookform/resolvers/zod";
import { signInWithEmailAndPassword } from "firebase/auth";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as z from "zod";

import { AppText } from "@/components/ui/AppText";
import { AuthLink } from "@/components/ui/AuthLink";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SocialButton } from "@/components/ui/SocialButton";
import { useTheme } from "@/hooks/use-theme";
import { getAuthErrorKey } from "@/lib/auth-errors";
import { auth } from "@/lib/firebase";
import { View } from "@/tw";

const loginSchema = z.object({
  email: z
    .string()
    .min(1, "auth.errors.missingFields")
    .email("auth.errors.invalidEmail"),
  password: z.string().min(1, "auth.errors.missingFields"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    mode: "onBlur",
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(data: LoginFormData) {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await signInWithEmailAndPassword(auth, data.email.trim(), data.password);
    } catch (error) {
      setSubmitError(getAuthErrorKey(error));
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
              {t("auth.login.title")}
            </AppText>
            <AppText tone="secondary" className="text-[16px] leading-[24px]">
              {t("auth.login.subtitle")}
            </AppText>
          </View>

          <View className="gap-5">
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
                  editable={!submitting}
                  error={
                    errors.email?.message ? t(errors.email.message) : undefined
                  }
                />
              )}
            />

            <View>
              <Controller
                control={control}
                name="password"
                render={({ field: { onChange, onBlur, value } }) => (
                  <Input
                    label={t("auth.passwordLabel")}
                    placeholder={t("auth.passwordPlaceholder")}
                    icon="lock-closed-outline"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    secureTextEntry
                    editable={!submitting}
                    showPasswordLabel={t("auth.showPassword")}
                    hidePasswordLabel={t("auth.hidePassword")}
                    error={
                      errors.password?.message
                        ? t(errors.password.message)
                        : undefined
                    }
                  />
                )}
              />

              <View className="self-end mt-3 py-1">
                <AuthLink
                  href="/forgot-password"
                  className="text-[13px] font-bold"
                >
                  {t("auth.forgotPassword")}
                </AuthLink>
              </View>
            </View>

            {submitError && (
              <AppText
                tone="error"
                className="text-[14px] font-medium text-center mt-2"
              >
                {t(submitError)}
              </AppText>
            )}
          </View>

          <View className="gap-6 mt-2">
            <Button onPress={handleSubmit(onSubmit)} loading={submitting}>
              {submitting
                ? t("auth.login.submitting")
                : t("auth.login.submit")}
            </Button>

            <View className="flex-row items-center gap-4">
              <View
                className="flex-1 h-px"
                style={{ backgroundColor: theme.border }}
              />
              <AppText tone="muted" className="text-[13px] font-semibold">
                {t("auth.orDivider")}
              </AppText>
              <View
                className="flex-1 h-px"
                style={{ backgroundColor: theme.border }}
              />
            </View>

            <SocialButton
              provider="google"
              disabled
              onPress={() => undefined}
            >
              {t("auth.continueWithGoogle")} ({t("auth.comingSoon")})
            </SocialButton>

            <View className="flex-row justify-center gap-1.5 mt-2">
              <AppText tone="secondary" className="text-[15px] font-medium">
                {t("auth.login.noAccount")}
              </AppText>
              <AuthLink href="/register" className="text-[15px] font-bold">
                {t("auth.login.goToRegister")}
              </AuthLink>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
