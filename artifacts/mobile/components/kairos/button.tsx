import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ActivityIndicator, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { PressableScale } from "@/components/kairos/pressable-scale";
import { useColors } from "@/hooks/use-colors";

type ButtonTone = "primary" | "secondary" | "danger" | "ghost";
type KairosButtonProps = {
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  icon?: keyof typeof MaterialIcons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  tone?: ButtonTone;
  compact?: boolean;
  style?: ViewStyle;
};

export function KairosButton({ label, onPress, accessibilityLabel, accessibilityHint, icon, loading = false, disabled = false, tone = "primary", compact = false, style }: KairosButtonProps) {
  const colors = useColors();
  const backgroundColor = tone === "primary" ? colors.primary : tone === "secondary" ? colors.surface : tone === "danger" ? colors.error : "transparent";
  const borderColor = tone === "primary" ? colors.primary : tone === "danger" ? colors.error : colors.border;
  const contentColor = tone === "primary" ? colors.background : tone === "danger" ? colors.foreground : colors.foreground;
  return (
    <PressableScale accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityHint={accessibilityHint} accessibilityState={{ busy: loading, disabled: disabled || loading }} disabled={disabled || loading} onPress={onPress} style={[styles.base, compact ? styles.compact : styles.regular, { backgroundColor, borderColor }, style]}>
      {loading ? <ActivityIndicator color={contentColor} /> : (
        <View style={styles.content}>
          {icon ? <MaterialIcons color={contentColor} name={icon} size={20} /> : null}
          <Text style={[styles.label, { color: contentColor }]}>{label}</Text>
        </View>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: 14, borderWidth: 1, justifyContent: "center", alignItems: "center", minHeight: 48 },
  regular: { paddingHorizontal: 20, paddingVertical: 13 },
  compact: { paddingHorizontal: 14, paddingVertical: 9 },
  content: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  label: { fontSize: 15, lineHeight: 20, fontWeight: "700" },
});
