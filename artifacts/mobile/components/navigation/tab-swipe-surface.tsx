import type { Href } from "expo-router";
import { useRouter } from "expo-router";
import { useCallback, useMemo, type ReactNode } from "react";
import { StyleSheet } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

type TabSwipeSurfaceProps = {
  children: ReactNode;
  direction: "left" | "right";
  destination: Href;
};

export function TabSwipeSurface({ children, direction, destination }: TabSwipeSurfaceProps) {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const translateX = useSharedValue(0);
  const navigate = useCallback(() => router.replace(destination), [destination, router]);

  const gesture = useMemo(() => Gesture.Pan()
    .activeOffsetX([-14, 14])
    .failOffsetY([-18, 18])
    .onUpdate((event) => {
      const valid = direction === "left" ? event.translationX < 0 : event.translationX > 0;
      translateX.value = valid && !reducedMotion ? event.translationX * 0.22 : 0;
    })
    .onEnd((event) => {
      const completed = direction === "left"
        ? event.translationX < -72 || event.velocityX < -620
        : event.translationX > 72 || event.velocityX > 620;
      if (!completed) {
        translateX.value = withTiming(0, { duration: reducedMotion ? 0 : 160 });
        return;
      }
      translateX.value = withTiming(direction === "left" ? -24 : 24, { duration: reducedMotion ? 0 : 110 }, () => {
        translateX.value = 0;
        runOnJS(navigate)();
      });
    })
    .onFinalize(() => {
      if (Math.abs(translateX.value) < 24) translateX.value = withTiming(0, { duration: reducedMotion ? 0 : 120 });
    }), [direction, navigate, reducedMotion, translateX]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: reducedMotion ? 1 : 1 - Math.min(Math.abs(translateX.value) / 420, 0.08),
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.container, animatedStyle]}>{children}</Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({ container: { flex: 1 } });
