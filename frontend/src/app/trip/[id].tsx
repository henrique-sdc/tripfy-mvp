// Deep link tripfy://trip/{id} → trip-detail (RF09).

import { useLocalSearchParams, router, type Href } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";

import { useTheme } from "@/hooks/use-theme";

export default function TripDeepLinkScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  useEffect(() => {
    if (typeof id !== "string" || !id.trim()) {
      router.replace("/(tabs)/trips" as Href);
      return;
    }
    router.replace({
      pathname: "/trip-detail",
      params: { tripId: id.trim() },
    } as Href);
  }, [id]);

  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: theme.background,
      }}
    >
      <ActivityIndicator color={theme.accent} />
    </View>
  );
}
