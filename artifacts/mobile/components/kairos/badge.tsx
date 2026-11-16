import { StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/use-colors";

type BadgeTone = "success" | "warning" | "error" | "neutral" | "primary";

export function KairosBadge({ label, tone = "neutral" }: { label: string; tone?: BadgeTone }) {
  const colors = useColors();
  const color = tone === "success"
    ? colors.success
    : tone === "warning"
      ? colors.warning
      : tone === "error"
        ? colors.error
        : tone === "primary"
          ? colors.primary
          : colors.muted;
  return (
    <View style={[styles.badge, { borderColor: color, backgroundColor: `${color}22` }]}>
      <Text style={[styles.label, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignSelf: "flex-start", borderRadius: 999, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 4 },
  label: { fontSize: 12, lineHeight: 16, fontWeight: "700" },
});
