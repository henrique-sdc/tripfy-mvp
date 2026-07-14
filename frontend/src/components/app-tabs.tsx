// Navegador RF04 — Início | Salvos | [✨] | Viagens | Perfil.
// O botão mágico não é rota; abre CreateTripSheet.

import { Tabs } from "expo-router";
import { useTranslation } from "react-i18next";

import { CreateTripSheet } from "@/components/navigation/CreateTripSheet";
import {
  FloatingTabBar,
  type FloatingTabBarProps,
} from "@/components/navigation/FloatingTabBar";

export default function AppTabs() {
  const { t } = useTranslation();

  return (
    <>
      <Tabs
        tabBar={(props) => (
          <FloatingTabBar {...(props as unknown as FloatingTabBarProps)} />
        )}
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: "transparent" },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{ title: t("tabs.home"), tabBarLabel: t("tabs.home") }}
        />
        <Tabs.Screen
          name="saved"
          options={{ title: t("tabs.saved"), tabBarLabel: t("tabs.saved") }}
        />
        <Tabs.Screen
          name="trips"
          options={{ title: t("tabs.trips"), tabBarLabel: t("tabs.trips") }}
        />
        <Tabs.Screen
          name="profile"
          options={{ title: t("tabs.profile"), tabBarLabel: t("tabs.profile") }}
        />
      </Tabs>
      <CreateTripSheet />
    </>
  );
}
