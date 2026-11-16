import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

import { KairosInput } from "@/components/kairos/input";
import { PressableScale } from "@/components/kairos/pressable-scale";
import { useColors } from "@/hooks/use-colors";
import { formatShortDate, formatTime } from "@/lib/date";

type DateTimeFieldProps = {
  label: string;
  value: Date;
  mode?: "date" | "time" | "datetime";
  onChange: (value: Date) => void;
};

function toLocalInputValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function DateTimeField({ label, value, mode = "datetime", onChange }: DateTimeFieldProps) {
  const colors = useColors();
  const [visible, setVisible] = useState(false);

  if (Platform.OS === "web") {
    return (
      <KairosInput
        label={label}
        value={toLocalInputValue(value)}
        helperText="Use YYYY-MM-DD HH:mm"
        onChangeText={(text) => {
          const parsed = new Date(text.replace(" ", "T"));
          if (!Number.isNaN(parsed.getTime())) onChange(parsed);
        }}
      />
    );
  }

  const display = mode === "date"
    ? formatShortDate(value.toISOString())
    : mode === "time"
      ? formatTime(value.toISOString())
      : `${formatShortDate(value.toISOString())}, ${formatTime(value.toISOString())}`;

  const handleChange = (event: DateTimePickerEvent, selected?: Date) => {
    setVisible(Platform.OS === "ios");
    if (event.type === "set" && selected) onChange(selected);
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text>
      <PressableScale
        accessibilityLabel={`${label}, ${display}`}
        accessibilityHint="Opens a date and time picker"
        onPress={() => setVisible(true)}
        style={[styles.field, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}
      >
        <Text style={[styles.value, { color: colors.foreground }]}>{display}</Text>
        <MaterialIcons color={colors.primary} name={mode === "time" ? "schedule" : "calendar-today"} size={21} />
      </PressableScale>
      {visible ? (
        <DateTimePicker
          display={Platform.OS === "ios" ? "spinner" : "default"}
          mode={mode === "date" ? "date" : "time"}
          onChange={handleChange}
          value={value}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 7 },
  label: { fontSize: 14, lineHeight: 19, fontWeight: "600" },
  field: { minHeight: 48, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  value: { flex: 1, fontSize: 16, lineHeight: 22 },
});
