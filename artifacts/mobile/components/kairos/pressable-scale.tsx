import * as Haptics from "expo-haptics";
import { useCallback, type ReactNode } from "react";
import {
  Platform,
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useReducedMotion } from "react-native-reanimated";

type PressableScaleProps = Omit<PressableProps, "style" | "children"> & {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  pressedStyle?: StyleProp<ViewStyle>;
  haptic?: "light" | "medium" | "none";
};

export function PressableScale({
  children,
  style,
  pressedStyle,
  haptic = "light",
  onPressIn,
  disabled,
  ...props
}: PressableScaleProps) {
  const reducedMotion = useReducedMotion();

  const handlePressIn = useCallback<NonNullable<PressableProps["onPressIn"]>>((event) => {
    if (!disabled && Platform.OS !== "web" && haptic !== "none") {
      void Haptics.impactAsync(
        haptic === "medium"
          ? Haptics.ImpactFeedbackStyle.Medium
          : Haptics.ImpactFeedbackStyle.Light,
      );
    }
    onPressIn?.(event);
  }, [disabled, haptic, onPressIn]);

  return (
    <Pressable
      {...props}
      disabled={disabled}
      onPressIn={handlePressIn}
      style={({ pressed }) => [
        style,
        pressed && !disabled && { opacity: 0.9, transform: reducedMotion ? undefined : [{ scale: 0.97 }] },
        pressed && pressedStyle,
        disabled && { opacity: 0.5 },
      ]}
    >
      {children}
    </Pressable>
  );
}
