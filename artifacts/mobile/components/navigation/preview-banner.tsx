import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { PressableScale } from "@/components/kairos/pressable-scale";
import { useColors } from "@/hooks/use-colors";
import { useKairosAuth } from "@/providers/supabase-auth-provider";

export function PreviewBanner() {
  const { user, signOut } = useKairosAuth();
  const router = useRouter();
  const colors = useColors();
  if (!user?.isPreview) return null;

  return (
    <View style={[styles.banner, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
      <View style={styles.copy}>
        <Text style={[styles.title, { color: colors.warning }]}>PREVIEW MODE</Text>
        <Text style={[styles.detail, { color: colors.muted }]}>UI testing only · No cloud saves or live AI</Text>
      </View>
      <PressableScale
        accessibilityLabel="Exit preview and return to login"
        haptic="none"
        onPress={() => { void signOut().then(() => router.replace("/login")); }}
        style={styles.exit}
      >
        <Text style={[styles.exitText, { color: colors.primary }]}>Exit preview</Text>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1 },
  copy: { flex: 1 },
  title: { fontSize: 11, lineHeight: 16, fontWeight: "900", letterSpacing: 1 },
  detail: { fontSize: 12, lineHeight: 18 },
  exit: { minHeight: 44, paddingHorizontal: 10, justifyContent: "center" },
  exitText: { fontSize: 13, lineHeight: 19, fontWeight: "700" },
});
