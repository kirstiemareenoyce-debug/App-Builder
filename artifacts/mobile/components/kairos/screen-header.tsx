import { Fonts } from "@/constants/theme";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { PressableScale } from "@/components/kairos/pressable-scale";
import { useColors } from "@/hooks/use-colors";

type ScreenHeaderProps = {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  rightAction?: {
    icon: keyof typeof MaterialIcons.glyphMap;
    label: string;
    onPress: () => void;
  };
  rightActions?: {
    icon: keyof typeof MaterialIcons.glyphMap;
    label: string;
    onPress: () => void;
  }[];
  foregroundColor?: string;
  mutedColor?: string;
  borderColor?: string;
};

export function ScreenHeader({
  title,
  subtitle,
  showBack = false,
  rightAction,
  rightActions = [],
  foregroundColor,
  mutedColor,
  borderColor,
}: ScreenHeaderProps) {
  const router = useRouter();
  const colors = useColors();
  const actions = rightAction ? [...rightActions, rightAction] : rightActions;
  return (
    <View style={styles.container}>
      <View style={styles.leading}>
        {showBack ? (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => router.back()}
            style={[styles.iconButton, { borderColor: borderColor ?? colors.border }]}
          >
            <MaterialIcons color={foregroundColor ?? colors.foreground} name="arrow-back-ios-new" size={20} />
          </PressableScale>
        ) : null}
        <View style={styles.copy}>
          <Text accessibilityRole="header" style={[styles.title, { color: foregroundColor ?? colors.foreground }]}> 
            {title}
          </Text>
          {subtitle ? <Text style={[styles.subtitle, { color: mutedColor ?? colors.muted }]}>{subtitle}</Text> : null}
        </View>
      </View>
      {actions.length > 0 ? (
        <View style={styles.actions}>
          {actions.map((action) => (
            <PressableScale
              key={action.label}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              onPress={action.onPress}
              style={[styles.iconButton, { borderColor: borderColor ?? colors.border }]}
            >
              <MaterialIcons color={foregroundColor ?? colors.foreground} name={action.icon} size={22} />
            </PressableScale>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { minHeight: 68, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  leading: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  copy: { flex: 1 },
  actions: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontFamily: Fonts.serif, fontSize: 30, lineHeight: 37, fontWeight: "400" },
  subtitle: { marginTop: 3, fontSize: 13, lineHeight: 19 },
  iconButton: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: "center", justifyContent: "center" },
});
