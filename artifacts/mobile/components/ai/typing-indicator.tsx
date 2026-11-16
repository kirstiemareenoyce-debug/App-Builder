import { StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/use-colors";

export function TypingIndicator() {
  const colors = useColors();
  return (
    <View accessibilityLabel="Evergreen AI is thinking" accessibilityLiveRegion="polite" style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {[0, 1, 2].map((dot) => <View key={dot} style={[styles.dot, { backgroundColor: colors.primary, opacity: 1 - dot * 0.2 }]} />)}
      <Text style={[styles.label, { color: colors.muted }]}>Thinking</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 16, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 10, marginBottom: 14 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: { marginLeft: 3, fontSize: 12, lineHeight: 16 },
});
