// Carrossel de apresentação — exibido uma vez por instalação (ver onboardingStore).
// iOS: painel inferior com Liquid Glass (BlurView).
// Android: overlay cinematográfico (LinearGradient) — sem blur leitoso.

import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Platform,
  ScrollView as RNScrollView,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import Animated, {
  Extrapolation,
  FadeInRight,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useOnboardingStore } from "@/stores/onboardingStore";
import { Pressable, Text, View } from "@/tw";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const isIOS = Platform.OS === "ios";

type SlideKey = "slide1" | "slide2" | "slide3";

// Só metadados estáticos — textos vêm do i18n via `slide.key`.
const SLIDES: { key: SlideKey; image: string }[] = [
  {
    key: "slide1",
    image:
      "https://images.unsplash.com/photo-1575986767340-5d17ae767ab0?q=80&w=1000&auto=format&fit=crop",
  },
  {
    key: "slide2",
    image:
      "https://images.unsplash.com/photo-1518684079-3c830dcef090?q=80&w=1000&auto=format&fit=crop",
  },
  {
    key: "slide3",
    image:
      "https://images.unsplash.com/photo-1499856871958-5b9627545d1a?q=80&w=1000&auto=format&fit=crop",
  },
];

const LAST_INDEX = SLIDES.length - 1;

/** Camada de foto com crossfade — componente separado evita hook dentro de .map(). */
function SlideBackground({
  index,
  scrollX,
  width,
  height,
  imageUri,
}: {
  index: number;
  scrollX: SharedValue<number>;
  width: number;
  height: number;
  imageUri: string;
}) {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollX.value,
      [(index - 1) * width, index * width, (index + 1) * width],
      [0, 1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  return (
    <Animated.View style={[style, { position: "absolute", width, height }]}>
      <Image
        source={{ uri: imageUri }}
        style={{ width, height }}
        contentFit="cover"
      />
    </Animated.View>
  );
}

function PaginationDot({
  index,
  scrollX,
  width,
}: {
  index: number;
  scrollX: SharedValue<number>;
  width: number;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const dotWidth = interpolate(
      scrollX.value,
      [(index - 1) * width, index * width, (index + 1) * width],
      [8, 24, 8],
      Extrapolation.CLAMP,
    );
    const opacity = interpolate(
      scrollX.value,
      [(index - 1) * width, index * width, (index + 1) * width],
      [0.3, 1, 0.3],
      Extrapolation.CLAMP,
    );
    return { width: dotWidth, opacity };
  });

  return (
    <Animated.View
      style={animatedStyle}
      className="h-2 rounded-full bg-white"
    />
  );
}

function ArrowFab({ onPress, label }: { onPress: () => void; label: string }) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        scale.value = withSpring(0.92, { damping: 20, stiffness: 300 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 20, stiffness: 300 });
      }}
      style={style}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="w-[54px] h-[54px] rounded-full bg-white items-center justify-center shadow-md"
    >
      <Ionicons name="arrow-forward" size={24} color="#111111" />
    </AnimatedPressable>
  );
}

export default function OnboardingSlidesScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const markSlidesSeen = useOnboardingStore((s) => s.markSlidesSeen);
  const scrollRef = useRef<RNScrollView>(null);

  const [activeIndex, setActiveIndex] = useState(0);
  const scrollX = useSharedValue(0);
  const isLastSlide = activeIndex === LAST_INDEX;
  const activeSlideKey = SLIDES[activeIndex].key;

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const offsetX = event.nativeEvent.contentOffset.x;
    scrollX.value = offsetX;
    const index = Math.round(offsetX / width);
    if (index !== activeIndex) setActiveIndex(index);
  }

  function handleAdvance() {
    if (isLastSlide) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      markSlidesSeen();
      return;
    }
    scrollRef.current?.scrollTo({
      x: width * (activeIndex + 1),
      animated: true,
    });
  }

  // Miolo compartilhado — invólucro muda por plataforma (BlurView vs View).
  const BottomContent = (
    <>
      <View className="min-h-[110px]" pointerEvents="none">
        <Text className="text-white text-[32px] font-bold mb-3">
          {t(`onboardingSlides.${activeSlideKey}.title`)}
        </Text>
        <Text className="text-white/70 text-[16px] leading-[24px]">
          {t(`onboardingSlides.${activeSlideKey}.description`)}
        </Text>
      </View>

      <View
        className="flex-row items-center justify-between mt-6"
        pointerEvents="box-none"
      >
        <View className="flex-row gap-2" pointerEvents="none">
          {SLIDES.map((slide, index) => (
            <PaginationDot
              key={slide.key}
              index={index}
              scrollX={scrollX}
              width={width}
            />
          ))}
        </View>

        {isLastSlide ? (
          <AnimatedPressable
            onPress={handleAdvance}
            onPressIn={() =>
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
            }
            entering={FadeInRight.duration(220)}
            className="bg-white rounded-full px-8 py-[14px] shadow-md"
          >
            <Text className="text-[#111111] font-bold text-[16px]">
              {t("onboardingSlides.start")}
            </Text>
          </AnimatedPressable>
        ) : (
          <ArrowFab onPress={handleAdvance} label={t("auth.nextSlide")} />
        )}
      </View>
    </>
  );

  return (
    <View className="flex-1 bg-black">
      <StatusBar style="light" />

      <View style={{ position: "absolute", width, height }}>
        {SLIDES.map((slide, index) => (
          <SlideBackground
            key={slide.key}
            index={index}
            scrollX={scrollX}
            width={width}
            height={height}
            imageUri={slide.image}
          />
        ))}
      </View>

      <LinearGradient
        colors={["rgba(0,0,0,0.5)", "transparent"]}
        locations={[0, 0.3]}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 10,
        }}
        pointerEvents="none"
      />

      {!isIOS && (
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.7)", "#000000"]}
          locations={[0, 0.4, 1]}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 10,
          }}
          pointerEvents="none"
        />
      )}

      <Text
        className="absolute w-full text-center text-white text-[22px] font-bold z-20"
        style={{ top: insets.top + 16 }}
      >
        {t("common.appName")}
      </Text>

      <RNScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        style={{ flex: 1, zIndex: 20 }}
      >
        {SLIDES.map((slide) => (
          <View key={slide.key} style={{ width, height }} />
        ))}
      </RNScrollView>

      <View
        className="absolute bottom-0 w-full z-30 rounded-t-[32px] overflow-hidden"
        style={{ paddingBottom: isIOS ? 0 : insets.bottom + 32 }}
        pointerEvents="box-none"
      >
        {isIOS ? (
          <BlurView
            intensity={80}
            tint="dark"
            className="pt-8 px-8 pb-10"
            style={{ paddingBottom: insets.bottom + 32 }}
          >
            {BottomContent}
          </BlurView>
        ) : (
          <View className="pt-8 px-8 pb-4">{BottomContent}</View>
        )}
      </View>
    </View>
  );
}
