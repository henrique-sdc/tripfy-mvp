// Tab bar RF04 — 4 abas + botão mágico central (não é rota).
// iOS: Liquid Glass. Android: bloco flutuante. Conteúdo rola por trás.

import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import { Platform } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText } from "@/components/ui/AppText";
import { useTheme } from "@/hooks/use-theme";
import { useCreateTripSheetStore } from "@/stores/createTripSheetStore";
import { Pressable, View } from "@/tw";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const SPRING = { damping: 18, stiffness: 280 };
const isIOS = Platform.OS === "ios";

export const TAB_BAR_CONTENT_HEIGHT = 58;
export const TAB_BAR_FLOAT_MARGIN = isIOS ? 0 : 12;
/** Quanto o botão mágico sobe acima da barra. */
export const MAGIC_BUTTON_OVERHANG = 22;
const MAGIC_SIZE = 58;

const GRADIENT = ["#2e1065", "#7c3aed", "#9d4edd"] as const;

export function useTabBarPadding(extra = 16): number {
  const insets = useSafeAreaInsets();
  // Gesture bar / home indicator: nunca use 0 no Android — senão corta o conteúdo.
  const bottomInset = Math.max(insets.bottom, isIOS ? 0 : 16);
  return (
    TAB_BAR_CONTENT_HEIGHT +
    MAGIC_BUTTON_OVERHANG +
    TAB_BAR_FLOAT_MARGIN +
    bottomInset +
    extra
  );
}

type TabIconName = keyof typeof Ionicons.glyphMap;

const TAB_ICONS: Record<
  string,
  { active: TabIconName; inactive: TabIconName }
> = {
  index: { active: "home", inactive: "home-outline" },
  saved: { active: "heart", inactive: "heart-outline" },
  trips: { active: "map", inactive: "map-outline" },
  profile: { active: "person", inactive: "person-outline" },
};

type TabRoute = { key: string; name: string; params?: object };

export type FloatingTabBarProps = {
  state: { index: number; routes: TabRoute[] };
  descriptors: Record<
    string,
    { options: { tabBarLabel?: unknown; title?: string } }
  >;
  navigation: {
    emit: (event: {
      type: string;
      target?: string;
      canPreventDefault?: boolean;
    }) => { defaultPrevented: boolean };
    navigate: (name: string, params?: object) => void;
  };
};

function TabItem({
  label,
  focused,
  onPress,
  onLongPress,
  routeName,
}: {
  label: string;
  focused: boolean;
  onPress: () => void;
  onLongPress: () => void;
  routeName: string;
}) {
  const theme = useTheme();
  const scale = useSharedValue(1);
  const icons = TAB_ICONS[routeName] ?? {
    active: "ellipse" as TabIconName,
    inactive: "ellipse-outline" as TabIconName,
  };
  const color = focused ? theme.accent : theme.textSecondary;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={focused ? { selected: true } : {}}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      onLongPress={onLongPress}
      onPressIn={() => {
        scale.value = withSpring(0.92, SPRING);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, SPRING);
      }}
      style={animatedStyle}
      className="flex-1 items-center justify-center gap-0.5 py-1"
    >
      <Ionicons
        name={focused ? icons.active : icons.inactive}
        size={22}
        color={color}
      />
      <AppText className="text-[10px] font-semibold" style={{ color }}>
        {label}
      </AppText>
    </AnimatedPressable>
  );
}

function MagicButton() {
  const { t } = useTranslation();
  const open = useCreateTripSheetStore((s) => s.open);
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={t("tabs.magicA11y")}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        open();
      }}
      onPressIn={() => {
        scale.value = withSpring(0.9, SPRING);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, SPRING);
      }}
      style={[
        style,
        {
          position: "absolute",
          left: "50%",
          marginLeft: -MAGIC_SIZE / 2,
          top: -MAGIC_BUTTON_OVERHANG,
          width: MAGIC_SIZE,
          height: MAGIC_SIZE,
          borderRadius: MAGIC_SIZE / 2,
          overflow: "hidden",
          elevation: 10,
          shadowColor: "#7c3aed",
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.45,
          shadowRadius: 12,
          zIndex: 20,
        },
      ]}
    >
      <LinearGradient
        colors={[...GRADIENT]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name="sparkles" size={26} color="#fff" />
      </LinearGradient>
    </AnimatedPressable>
  );
}

function buildTabItems({
  state,
  descriptors,
  navigation,
}: FloatingTabBarProps) {
  return state.routes.map((route, index) => {
    const { options } = descriptors[route.key];
    const label =
      typeof options.tabBarLabel === "string"
        ? options.tabBarLabel
        : typeof options.title === "string"
          ? options.title
          : route.name;
    const focused = state.index === index;

    return (
      <TabItem
        key={route.key}
        label={label}
        focused={focused}
        routeName={route.name}
        onPress={() => {
          const event = navigation.emit({
            type: "tabPress",
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        }}
        onLongPress={() => {
          navigation.emit({ type: "tabLongPress", target: route.key });
        }}
      />
    );
  });
}

export function FloatingTabBar(props: FloatingTabBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const bottomPad = isIOS
    ? Math.max(insets.bottom, 8)
    : Math.max(insets.bottom, 16) + TAB_BAR_FLOAT_MARGIN;

  const items = buildTabItems(props);
  // Ordem das rotas: [Início, Salvos] | ✨ | [Viagens, Perfil]
  const left = items.slice(0, 2);
  const right = items.slice(2);

  const row = (
    <View
      className="flex-row items-center"
      style={{ height: TAB_BAR_CONTENT_HEIGHT }}
    >
      {left}
      {/* Espaço reservado sob o botão mágico. */}
      <View style={{ width: MAGIC_SIZE + 8 }} />
      {right}
    </View>
  );

  if (isIOS) {
    return (
      <View
        pointerEvents="box-none"
        className="absolute left-0 right-0 bottom-0"
        style={{ paddingTop: MAGIC_BUTTON_OVERHANG }}
      >
        <View pointerEvents="box-none" className="overflow-visible">
          <MagicButton />
          <BlurView
            intensity={80}
            tint="systemChromeMaterial"
            style={{
              paddingBottom: bottomPad,
              borderTopWidth: 0.5,
              borderTopColor: theme.borderGlass,
              overflow: "hidden",
            }}
          >
            {row}
          </BlurView>
        </View>
      </View>
    );
  }

  return (
    <View
      pointerEvents="box-none"
      className="absolute left-0 right-0 bottom-0 px-4"
      style={{
        paddingBottom: bottomPad,
        paddingTop: MAGIC_BUTTON_OVERHANG,
      }}
    >
      <View pointerEvents="box-none" className="overflow-visible">
        <MagicButton />
        <View
          className="rounded-[28px] border border-border overflow-hidden"
          style={{
            backgroundColor: theme.surface,
            borderColor: "transparent",
            elevation: 8,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.18,
            shadowRadius: 12,
          }}
        >
          {row}
        </View>
      </View>
    </View>
  );
}
