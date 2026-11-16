import Slider from "@react-native-community/slider";
import { StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/use-colors";

type KairosSliderProps = {
  label: string;
  value: number;
  minimumValue: number;
  maximumValue: number;
  step: number;
  valueLabel?: string;
  minimumLabel?: string;
  maximumLabel?: string;
  onValueChange: (value: number) => void;
};

export function KairosSlider({
  label,
  value,
  minimumValue,
  maximumValue,
  step,
  valueLabel,
  minimumLabel,
  maximumLabel,
  onValueChange,
}: KairosSliderProps) {
  const colors = useColors();
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text>
        <Text style={[styles.value, { color: colors.primary }]}>{valueLabel ?? value}</Text>
      </View>
      <Slider
        accessibilityLabel={label}
        accessibilityValue={{ min: minimumValue, max: maximumValue, now: value, text: valueLabel }}
        maximumTrackTintColor={colors.border}
        maximumValue={maximumValue}
        minimumTrackTintColor={colors.primary}
        minimumValue={minimumValue}
        onValueChange={onValueChange}
        step={step}
        thumbTintColor={colors.primary}
        value={value}
      />
      <View style={styles.labels}>
        <Text style={[styles.caption, { color: colors.muted }]}>{minimumLabel}</Text>
        <Text style={[styles.caption, { color: colors.muted }]}>{maximumLabel}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 6 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  label: { fontSize: 16, lineHeight: 22, fontWeight: "600" },
  value: { fontSize: 20, lineHeight: 25, fontWeight: "800" },
  labels: { flexDirection: "row", justifyContent: "space-between" },
  caption: { fontSize: 12, lineHeight: 17 },
});
