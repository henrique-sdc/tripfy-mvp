// Editar perfil + exclusão de conta (RF03 / LGPD RN01).

import { Ionicons } from "@expo/vector-icons";
import { zodResolver } from "@hookform/resolvers/zod";
import * as Haptics from "@/lib/haptics";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as z from "zod";

import { AppText } from "@/components/ui/AppText";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useTheme } from "@/hooks/use-theme";
import { getAuthErrorKey } from "@/lib/auth-errors";
import { auth } from "@/lib/firebase";
import {
  getUserProfile,
  profilePhotoUri,
  updateUserProfile,
} from "@/lib/profile";
import { useAuthStore } from "@/stores/authStore";
import { Pressable, ScrollView, View } from "@/tw";

const NAME_PATTERN = /^[A-Za-zÀ-ÖØ-öø-ÿ\s]+$/;

const editSchema = z.object({
  name: z
    .string()
    .min(3, "editProfile.errors.nameTooShort")
    .regex(NAME_PATTERN, "editProfile.errors.nameInvalidChars"),
  bio: z.string().max(140, "editProfile.errors.bioTooLong"),
});

type EditFormData = z.infer<typeof editSchema>;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function EditProfileScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const scheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const setUser = useAuthStore((s) => s.setUser);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [photoDirty, setPhotoDirty] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isValid },
  } = useForm<EditFormData>({
    resolver: zodResolver(editSchema),
    mode: "onChange",
    defaultValues: { name: "", bio: "" },
  });

  const nameValue = watch("name");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const profile = await getUserProfile();
        if (cancelled || !profile) return;
        reset({ name: profile.name, bio: profile.bio });
        setPhotoBase64(profile.photoBase64);
      } catch (err) {
        console.error("[edit-profile] load:", err);
        if (!cancelled) {
          setFormError("editProfile.errors.loadFailed");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reset]);

  const previewUri = photoBase64
    ? profilePhotoUri({ photoBase64 })
    : auth.currentUser?.photoURL ?? null;

  async function onPickPhoto() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        t("editProfile.photoPermissionTitle"),
        t("editProfile.photoPermissionBody"),
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });

    if (result.canceled || !result.assets[0]?.base64) return;
    setPhotoBase64(result.assets[0].base64);
    setPhotoDirty(true);
  }

  function onRemovePhoto() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPhotoBase64(null);
    setPhotoDirty(true);
  }

  async function onSave(data: EditFormData) {
    setSaving(true);
    setFormError(null);
    try {
      await updateUserProfile(
        data.name,
        data.bio,
        photoDirty ? photoBase64 : undefined,
      );
      // Espelha Auth no Zustand pra Home/Perfil refletirem o nome na hora.
      setUser(auth.currentUser);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (err) {
      console.error("[edit-profile] save:", err);
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("Foto muito grande")) {
        setFormError("editProfile.errors.photoTooLarge");
      } else {
        setFormError(getAuthErrorKey(err));
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingBottom: insets.bottom + 32,
          paddingHorizontal: 24,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-row items-center mb-6">
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
            <Ionicons
              name="chevron-back"
              size={22}
              color={theme.textPrimary}
            />
          </Pressable>
          <AppText className="text-[20px] font-bold flex-1">
            {t("editProfile.title")}
          </AppText>
        </View>

        {loading ? (
          <AppText tone="secondary" className="text-center mt-12">
            {t("common.loading")}
          </AppText>
        ) : (
          <>
            <View className="items-center mb-8">
              <Pressable
                onPress={onPickPhoto}
                accessibilityLabel={t("editProfile.changePhoto")}
                className="relative"
              >
                <View
                  className="w-28 h-28 rounded-full overflow-hidden items-center justify-center border"
                  style={{
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                  }}
                >
                  {previewUri ? (
                    <Image
                      source={{ uri: previewUri }}
                      style={{ width: 112, height: 112 }}
                      contentFit="cover"
                    />
                  ) : (
                    <AppText className="text-[32px] font-bold" tone="secondary">
                      {initials(nameValue || t("profile.fallbackName"))}
                    </AppText>
                  )}
                </View>
                <View
                  className="absolute bottom-0 right-0 w-9 h-9 rounded-full items-center justify-center border"
                  style={{
                    backgroundColor: theme.buttonPrimary,
                    borderColor: theme.background,
                  }}
                >
                  <Ionicons
                    name="camera"
                    size={18}
                    color={theme.buttonText}
                  />
                </View>
              </Pressable>
              <AppText tone="muted" className="text-[12px] mt-3">
                {t("editProfile.photoHint")}
              </AppText>
              {previewUri ? (
                <Pressable onPress={onRemovePhoto} hitSlop={8} className="mt-1">
                  <AppText
                    className="text-[13px] font-semibold"
                    style={{ color: theme.error }}
                  >
                    {t("editProfile.removePhoto")}
                  </AppText>
                </Pressable>
              ) : null}
            </View>

            <View className="gap-4 mb-6">
              <Controller
                control={control}
                name="name"
                render={({ field: { onChange, onBlur, value } }) => (
                  <Input
                    label={t("editProfile.nameLabel")}
                    icon="person-outline"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    autoCapitalize="words"
                    error={
                      errors.name?.message
                        ? t(errors.name.message)
                        : undefined
                    }
                  />
                )}
              />
              <Controller
                control={control}
                name="bio"
                render={({ field: { onChange, onBlur, value } }) => (
                  <Input
                    label={t("editProfile.bioLabel")}
                    icon="chatbubble-ellipses-outline"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    maxLength={140}
                    placeholder={t("editProfile.bioPlaceholder")}
                    error={
                      errors.bio?.message
                        ? t(errors.bio.message)
                        : undefined
                    }
                  />
                )}
              />
              <AppText tone="muted" className="text-[11px] self-end -mt-2">
                {t("editProfile.bioCounter", {
                  count: watch("bio")?.length ?? 0,
                })}
              </AppText>
            </View>

            {formError ? (
              <AppText
                className="text-[13px] text-center mb-4"
                style={{ color: theme.error }}
              >
                {t(formError)}
              </AppText>
            ) : null}

            <Button
              onPress={handleSubmit(onSave)}
              loading={saving}
              disabled={!isValid || saving}
            >
              {t("editProfile.save")}
            </Button>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
