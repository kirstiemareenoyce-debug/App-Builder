import { StyleSheet, View, type ViewProps } from "react-native";

import { useColors } from "@/hooks/use-colors";

export function KairosCard({ style, ...props }: ViewProps) {
  const colors = useColors();
  return (
    <View
      {...props}
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, style]}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    shadowColor: "#000000",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
});
