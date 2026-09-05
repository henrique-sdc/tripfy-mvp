// Seletor em cápsula — indicador desliza com withTiming (Emil: 150–250ms).
// Largura dos segmentos é calculada a partir do container (N opções iguais),
// não via onLayout por item — evita indicador torto quando os rótulos têm
// tamanhos diferentes (ex.: "Sozinho(a)" vs "Família").

import * as Haptics from "@/lib/haptics";
import { useEffect, useState } from "react";
import { LayoutChangeEvent } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { AppText } from "@/components/ui/AppText";
import { useTheme } from "@/hooks/use-theme";
import { Pressable, View } from "@/tw";

const PADDING = 4; // espelha p-1 do container

type Option = { value: string; label: string };

type CapsuleSelectorProps = {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

export function CapsuleSelector({
  options,
  value,
  onChange,
  disabled,
}: CapsuleSelectorProps) {
  const theme = useTheme();
  const [trackWidth, setTrackWidth] = useState(0);

  const indicatorX = useSharedValue(PADDING);
  const indicatorW = useSharedValue(0);

  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  const segmentWidth =
    trackWidth > 0 ? (trackWidth - PADDING * 2) / options.length : 0;

  useEffect(() => {
    if (segmentWidth <= 0) return;
    indicatorX.value = withTiming(PADDING + selectedIndex * segmentWidth, {
      duration: 220,
    });
    indicatorW.value = withTiming(segmentWidth, { duration: 220 });
  }, [selectedIndex, segmentWidth, indicatorX, indicatorW]);

  function handleTrackLayout(e: LayoutChangeEvent) {
    setTrackWidth(e.nativeEvent.layout.width);
  }

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
    width: indicatorW.value,
  }));

  return (
    <View
      onLayout={handleTrackLayout}
      className="flex-row relative rounded-full p-1 border"
      style={{ borderColor: theme.border, backgroundColor: theme.surface }}
    >
      <Animated.View
        style={[
          indicatorStyle,
          {
            position: "absolute",
            top: PADDING,
            bottom: PADDING,
            left: 0,
            borderRadius: 999,
            backgroundColor: theme.buttonPrimary,
          },
        ]}
        pointerEvents="none"
      />

      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            disabled={disabled}
            onPress={() => {
              Haptics.selectionAsync();
              onChange(opt.value);
            }}
            className="flex-1 py-3 px-2 items-center justify-center z-10"
          >
            <AppText
              className="text-sm font-semibold text-center"
              style={{ color: selected ? theme.buttonText : theme.textSecondary }}
            >
              {opt.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
