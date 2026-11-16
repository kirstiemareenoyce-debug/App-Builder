import { StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/use-colors";
import type { ConfidenceLevel } from "@/types/evergreen";

const LABELS: Record<ConfidenceLevel, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
};

export function ConfidenceBadge({ level, confidence }: { level: ConfidenceLevel; confidence: number }) {
  const colors = useColors();
  const color = level === "high" ? colors.success : level === "medium" ? colors.warning : colors.error;
  const percent = Math.round(confidence * 100);
  return (
    <View
      accessibilityLabel={`${LABELS[level]}, ${percent} percent`}
      style={[styles.badge, { borderColor: color, backgroundColor: `${color}20` }]}
    >
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.label, { color }]}>{LABELS[level]} · {percent}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: { fontSize: 11, lineHeight: 15, fontWeight: "700" },
});
