// Tab bar RF04 — 4 abas + botão mágico central (não é rota).
// Pílula flutuante em vidro nativo; o conteúdo da tela rola por trás.
// A escada iOS 26 / iOS 16.4 / Android mora toda no GlassSurface.

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { LayoutChangeEvent } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText } from "@/components/ui/AppText";
import { GlassSurface } from "@/components/ui/GlassSurface";
import { useTheme } from "@/hooks/use-theme";
import { useCreateTripSheetStore } from "@/stores/createTripSheetStore";
import { AnimatedPressable, View } from "@/tw";

/** Feedback de toque: rápido e seco. */
const PRESS_SPRING = { damping: 18, stiffness: 280 };
/** Indicador: anda e para. Spring quica; tab troca dezenas de vezes por dia. */
const INDICATOR_MOVE = {
  duration: 240,
  easing: Easing.out(Easing.cubic),
};

const TAB_BAR_CONTENT_HEIGHT = 58;
const TAB_BAR_FLOAT_MARGIN = 16;
const TAB_BAR_SIDE_MARGIN = 16;
const MAGIC_BUTTON_OVERHANG = 22;
const MAGIC_SIZE = 58;
/** Vão reservado na linha para o botão mágico não cobrir ícone nenhum. */
const MAGIC_SLOT = MAGIC_SIZE + 8;
const TAB_COUNT = 4;
const INDICATOR_HEIGHT = TAB_BAR_CONTENT_HEIGHT - 12;

const GRADIENT = ["#2e1065", "#7c3aed", "#9d4edd"] as const;

/** Distância entre a base da tela e a base da pílula. */
function useTabBarBottom(): number {
  const insets = useSafeAreaInsets();
  // Piso de 8: Android com navegação por gestos reporta inset ~0 e a pílula colaria.
  return Math.max(insets.bottom, 8) + TAB_BAR_FLOAT_MARGIN;
}

/** Padding que as telas precisam no fim do scroll para não sumir sob a pílula. */
export function useTabBarPadding(extra = 16): number {
  const bottom = useTabBarBottom();
  return TAB_BAR_CONTENT_HEIGHT + MAGIC_BUTTON_OVERHANG + bottom + extra;
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

/** Largura de uma aba, descontado o vão do botão mágico. */
function tabWidth(rowWidth: number): number {
  return (rowWidth - MAGIC_SLOT) / TAB_COUNT;
}

/** Centro do item `index` na linha — as duas últimas abas ficam depois do vão. */
function tabCenter(index: number, rowWidth: number): number {
  const width = tabWidth(rowWidth);
  const offset = index < TAB_COUNT / 2 ? 0 : MAGIC_SLOT;
  return offset + index * width + width / 2;
}

/** Bolha que desliza atrás da aba ativa. */
function ActiveIndicator({
  index,
  rowWidth,
}: {
  index: number;
  rowWidth: number;
}) {
  const theme = useTheme();
  const x = useSharedValue(0);
  const positioned = useRef(false);

  const width = Math.max(tabWidth(rowWidth) - 6, 0);
  const left = rowWidth > 0 ? tabCenter(index, rowWidth) - width / 2 : 0;

  useEffect(() => {
    if (rowWidth === 0) return;
    // No primeiro layout ela já nasce no lugar; deslizar do canto seria ruído.
    if (positioned.current) {
      x.value = withTiming(left, INDICATOR_MOVE);
    } else {
      positioned.current = true;
      x.value = left;
    }
  }, [left, rowWidth, x]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
  }));

  if (rowWidth === 0) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        style,
        {
          position: "absolute",
          left: 0,
          top: 6,
          width,
          height: INDICATOR_HEIGHT,
          borderRadius: INDICATOR_HEIGHT / 2,
          backgroundColor: `${theme.accent}22`,
        },
      ]}
    />
  );
}

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
        scale.value = withSpring(0.92, PRESS_SPRING);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, PRESS_SPRING);
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
        scale.value = withSpring(0.9, PRESS_SPRING);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, PRESS_SPRING);
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
        },
      ]}
    >
      <LinearGradient
        colors={[...GRADIENT]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
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
  const bottom = useTabBarBottom();
  const [rowWidth, setRowWidth] = useState(0);

  const items = buildTabItems(props);
  // Ordem das rotas: [Início, Salvos] | ✨ | [Viagens, Perfil]
  const left = items.slice(0, TAB_COUNT / 2);
  const right = items.slice(TAB_COUNT / 2);

  function handleRowLayout(event: LayoutChangeEvent) {
    setRowWidth(event.nativeEvent.layout.width);
  }

  return (
    // O paddingTop mantém o botão mágico dentro dos limites do container: no
    // Android, filho que estoura a caixa do pai não recebe toque.
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: TAB_BAR_SIDE_MARGIN,
        right: TAB_BAR_SIDE_MARGIN,
        bottom,
        paddingTop: MAGIC_BUTTON_OVERHANG,
      }}
    >
      <View pointerEvents="box-none">
        <GlassSurface
          style={{
            borderRadius: TAB_BAR_CONTENT_HEIGHT / 2,
            overflow: "hidden",
          }}
        >
          <View
            className="flex-row items-center"
            style={{ height: TAB_BAR_CONTENT_HEIGHT }}
            onLayout={handleRowLayout}
          >
            <ActiveIndicator index={props.state.index} rowWidth={rowWidth} />
            {left}
            <View style={{ width: MAGIC_SLOT }} />
            {right}
          </View>
        </GlassSurface>

        {/* Depois da pílula na árvore para pintar por cima dela. */}
        <MagicButton />
      </View>
    </View>
  );
}
