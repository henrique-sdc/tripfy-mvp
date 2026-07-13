// Tela de cadastro (RF01). Validação via react-hook-form + Zod.

import { zodResolver } from "@hookform/resolvers/zod";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
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
import { PasswordStrengthBar } from "@/components/ui/PasswordStrengthBar";
import { useTheme } from "@/hooks/use-theme";
import { getAuthErrorKey } from "@/lib/auth-errors";
import { auth } from "@/lib/firebase";
import { View } from "@/tw";

const NAME_PATTERN = /^[A-Za-zÀ-ÖØ-öø-ÿ\s]+$/;

function formatDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function parseBirthDate(value: string): Date | null {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, d, m, y] = match.map(Number);
  const date = new Date(y, m - 1, d);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== m - 1 ||
    date.getDate() !== d
  )
    return null;
  return date;
}

const signUpSchema = z
  .object({
    name: z
      .string()
      .min(3, "auth.errors.nameTooShort")
      .regex(NAME_PATTERN, "auth.errors.nameInvalidChars"),
    email: z.string().email("auth.errors.invalidEmail"),
    birthDate: z
      .string()
      .regex(/^\d{2}\/\d{2}\/\d{4}$/, "auth.errors.birthDateRequired")
      .refine((val) => {
        const d = parseBirthDate(val);
        if (!d) return false;
        const age =
          new Date(Date.now() - d.getTime()).getUTCFullYear() - 1970;
        return age >= 18;
      }, "auth.errors.mustBeAdult"),
    password: z.string().min(8, "auth.errors.passwordMinLength"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "auth.errors.passwordMismatch",
    path: ["confirmPassword"],
  });

type SignUpFormData = z.infer<typeof signUpSchema>;

export default function RegisterScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    watch,
    formState: { errors, isValid },
  } = useForm<SignUpFormData>({
    resolver: zodResolver(signUpSchema),
    mode: "onChange",
    defaultValues: {
      name: "",
      email: "",
      birthDate: "",
      password: "",
      confirmPassword: "",
    },
  });

  const passwordValue = watch("password");

  async function onSubmit(data: SignUpFormData) {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const credential = await createUserWithEmailAndPassword(
        auth,
        data.email.trim(),
        data.password,
      );
      await updateProfile(credential.user, { displayName: data.name.trim() });
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
          paddingTop: insets.top + 32,
          paddingBottom: insets.bottom + 32,
          paddingHorizontal: 24,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-8">
          <View className="gap-2">
            <AppText className="text-[32px] font-bold tracking-tight">
              {t("auth.register.title")}
            </AppText>
            <AppText tone="secondary" className="text-[16px] leading-[24px]">
              {t("auth.register.subtitle")}
            </AppText>
          </View>

          <View className="gap-5">
            <Controller
              control={control}
              name="name"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label={t("auth.fullNameLabel")}
                  placeholder={t("auth.namePlaceholder")}
                  icon="person-outline"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  autoCapitalize="words"
                  editable={!submitting}
                  error={
                    errors.name?.message ? t(errors.name.message) : undefined
                  }
                />
              )}
            />
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
            <Controller
              control={control}
              name="birthDate"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label={t("auth.birthDateLabel")}
                  placeholder={t("auth.birthDatePlaceholder")}
                  icon="calendar-outline"
                  value={value}
                  onChangeText={(raw) => onChange(formatDateInput(raw))}
                  onBlur={onBlur}
                  keyboardType="number-pad"
                  maxLength={10}
                  editable={!submitting}
                  error={
                    errors.birthDate?.message
                      ? t(errors.birthDate.message)
                      : undefined
                  }
                />
              )}
            />

            <View className="gap-1">
              <Controller
                control={control}
                name="password"
                render={({ field: { onChange, onBlur, value } }) => (
                  <Input
                    label={t("auth.passwordLabel")}
                    placeholder={t("auth.passwordMinPlaceholder")}
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
              <PasswordStrengthBar password={passwordValue} />
            </View>

            <Controller
              control={control}
              name="confirmPassword"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label={t("auth.confirmPasswordLabel")}
                  placeholder={t("auth.confirmPasswordPlaceholder")}
                  icon="shield-checkmark-outline"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  secureTextEntry
                  editable={!submitting}
                  showPasswordLabel={t("auth.showPassword")}
                  hidePasswordLabel={t("auth.hidePassword")}
                  error={
                    errors.confirmPassword?.message
                      ? t(errors.confirmPassword.message)
                      : undefined
                  }
                />
              )}
            />

            {submitError && (
              <AppText
                tone="error"
                className="text-[14px] font-medium text-center mt-2"
              >
                {t(submitError)}
              </AppText>
            )}
          </View>

          <View className="gap-6 mt-4">
            <Button
              onPress={handleSubmit(onSubmit)}
              loading={submitting}
              disabled={!isValid}
            >
              {submitting
                ? t("auth.register.submitting")
                : t("auth.register.submit")}
            </Button>

            <View className="flex-row justify-center gap-1.5">
              <AppText tone="secondary" className="text-[15px] font-medium">
                {t("auth.register.hasAccount")}
              </AppText>
              <AuthLink href="/login" className="text-[15px] font-bold">
                {t("auth.register.goToLogin")}
              </AuthLink>
            </View>

            <AppText
              tone="secondary"
              className="text-[11px] text-center leading-4"
            >
              {t("auth.register.termsPrefix")}
              <AppText tone="accent" className="text-[11px]">
                {t("auth.register.termsOfUse")}
              </AppText>
              {t("auth.register.termsMiddle")}
              <AppText tone="accent" className="text-[11px]">
                {t("auth.register.termsPrivacy")}
              </AppText>
              {t("auth.register.termsSuffix")}
            </AppText>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
