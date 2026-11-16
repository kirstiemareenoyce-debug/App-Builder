import type { ReactNode } from "react";
import { StyleSheet, View, type ViewProps } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";

import { cn } from "@/lib/utils";

export interface ScreenContainerProps extends ViewProps {
  /** Safe-area edges. Bottom clearance is generally handled by navigation. */
  edges?: Edge[];
  /** Optional fixed header, outside scrolling content and inside the safe area. */
  header?: ReactNode;
  className?: string;
  containerClassName?: string;
  safeAreaClassName?: string;
}

/** Bounded screen frame: fixed headers cannot disappear with list scroll offsets. */
export function ScreenContainer({
  children,
  edges = ["top", "left", "right"],
  header,
  className,
  containerClassName,
  safeAreaClassName,
  style,
  ...props
}: ScreenContainerProps) {
  return (
    <View className={cn("flex-1", "bg-background", containerClassName)} style={styles.frame} {...props}>
      <SafeAreaView edges={edges} className={cn("flex-1", safeAreaClassName)} style={[styles.frame, style]}>
        {header ? <View style={styles.header}>{header}</View> : null}
        <View style={styles.frame} className={cn("flex-1", className)}>{children}</View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, minHeight: 0 },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8, flexShrink: 0 },
});
