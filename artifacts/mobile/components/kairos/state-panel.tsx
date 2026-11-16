import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { KairosButton } from "@/components/kairos/button";
import { useColors } from "@/hooks/use-colors";

type StatePanelProps = {
  title: string;
  message: string;
  loading?: boolean;
  icon?: keyof typeof MaterialIcons.glyphMap;
  actionLabel?: string;
  onAction?: () => void;
};

export function StatePanel({ title, message, loading, icon = "inbox", actionLabel, onAction }: StatePanelProps) {
  const colors = useColors();
  return (
    <View accessibilityLiveRegion="polite" style={styles.container}>
      {loading ? (
        <ActivityIndicator color={colors.primary} size="large" />
      ) : (
        <MaterialIcons color={colors.muted} name={icon} size={38} />
      )}
      <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.message, { color: colors.muted }]}>{message}</Text>
      {actionLabel && onAction ? <KairosButton compact label={actionLabel} onPress={onAction} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 28 },
  title: { fontSize: 18, lineHeight: 23, fontWeight: "700", textAlign: "center" },
  message: { maxWidth: 340, fontSize: 15, lineHeight: 22, textAlign: "center" },
});
