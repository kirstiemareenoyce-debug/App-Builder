import { StyleSheet, Text } from "react-native";

import { PressableScale } from "@/components/kairos/pressable-scale";
import { useColors } from "@/hooks/use-colors";

type KairosChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  accessibilityHint?: string;
};

export function KairosChip({ label, selected, onPress, accessibilityHint }: KairosChipProps) {
  const colors = useColors();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? colors.primary : colors.surface,
          borderColor: selected ? colors.primary : colors.border,
        },
      ]}
    >
      <Text style={[styles.label, { color: selected ? colors.background : colors.foreground }]}>{label}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  chip: { minHeight: 40, borderRadius: 20, borderWidth: 1, paddingHorizontal: 14, justifyContent: "center" },
  label: { fontSize: 14, lineHeight: 18, fontWeight: "600" },
});
