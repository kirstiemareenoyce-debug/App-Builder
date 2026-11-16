import { forwardRef, useState, type ComponentRef } from "react";
import { StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from "react-native";
import { useColors } from "@/hooks/use-colors";

type KairosInputProps = TextInputProps & {
  label: string;
  error?: string | null;
  helperText?: string;
  containerStyle?: ViewStyle;
  labelColor?: string;
};

export const KairosInput = forwardRef<ComponentRef<typeof TextInput>, KairosInputProps>(function KairosInput({ label, error, helperText, multiline, containerStyle, labelColor, style, ...props }, ref) {
  const colors = useColors();
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.container, containerStyle]}>
      <Text style={[styles.label, { color: labelColor ?? colors.primary }]}>{label}</Text>
      <TextInput
        {...props}
        ref={ref}
        accessibilityLabel={props.accessibilityLabel ?? label}
        multiline={multiline}
        onBlur={(event) => { setFocused(false); props.onBlur?.(event); }}
        onFocus={(event) => { setFocused(true); props.onFocus?.(event); }}
        placeholderTextColor={colors.tertiary}
        selectionColor={colors.primary}
        style={[styles.input, multiline && styles.multiline, { backgroundColor: colors.backgroundSecondary, borderColor: error ? colors.error : focused ? colors.focus : colors.border, color: colors.foreground }, style]}
      />
      {error ? <Text accessibilityLiveRegion="polite" style={[styles.meta, { color: colors.error }]}>{error}</Text> : helperText ? <Text style={[styles.meta, { color: colors.muted }]}>{helperText}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { gap: 7 },
  label: { fontSize: 11, lineHeight: 16, fontWeight: "800", letterSpacing: 1.15, textTransform: "uppercase" },
  input: { minHeight: 50, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, lineHeight: 22 },
  multiline: { minHeight: 112, textAlignVertical: "top" },
  meta: { fontSize: 12, lineHeight: 17 },
});
