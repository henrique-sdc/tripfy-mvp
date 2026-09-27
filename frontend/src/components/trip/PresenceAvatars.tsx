// Bolinhas de quem está na sala. O slot fica reservado pra lista não pular.

import { Image } from "expo-image";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { AppText } from "@/components/ui/AppText";
import { useTheme } from "@/hooks/use-theme";
import type { PresencePeer } from "@/hooks/use-trip-presence";

const SIZE = 28;

type Props = {
  peers: PresencePeer[];
  colors: [string, string];
  labelFor: (name: string) => string;
};

function Avatar({
  peer,
  color,
  label,
}: {
  peer: PresencePeer;
  color: string;
  label: string;
}) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(reduceMotion ? 1 : 0.85);
  useEffect(() => {
    scale.value = reduceMotion
      ? 1
      : withSpring(1, { damping: 18, stiffness: 260 });
  }, [reduceMotion, scale]);
  const anim = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const initial = (peer.name.trim().slice(0, 1) || "?").toUpperCase();

  return (
    <Animated.View
      style={[styles.dot, { borderColor: color, backgroundColor: color }, anim]}
      accessibilityLabel={label}
    >
      {peer.photoUrl ? (
        <Image
          source={{ uri: peer.photoUrl }}
          style={styles.photo}
          contentFit="cover"
        />
      ) : (
        <AppText
          className="text-[11px] font-semibold"
          style={{ color: theme.presenceText }}
        >
          {initial}
        </AppText>
      )}
    </Animated.View>
  );
}

export function PresenceAvatars({ peers, colors, labelFor }: Props) {
  const shown = peers.slice(0, 2);
  return (
    <View style={styles.slot}>
      {shown.map((peer, index) => (
        <Avatar
          key={peer.uid}
          peer={peer}
          color={colors[index % 2]}
          label={labelFor(peer.name || peer.uid)}
        />
      ))}
    </View>
  );
}

export function presenceColorFor(
  uid: string,
  peers: PresencePeer[],
  colors: [string, string],
): string {
  const index = Math.max(
    0,
    peers.findIndex((peer) => peer.uid === uid),
  );
  return colors[index % 2];
}

const styles = StyleSheet.create({
  slot: {
    width: SIZE * 2 + 6,
    height: SIZE,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  dot: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginLeft: -6,
  },
  photo: {
    width: SIZE - 4,
    height: SIZE - 4,
    borderRadius: (SIZE - 4) / 2,
  },
});
