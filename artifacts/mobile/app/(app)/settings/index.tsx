import { Fonts } from "@/constants/theme";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Notifications from "expo-notifications";
import { useRouter, type Href } from "expo-router";
import { useMemo } from "react";
import { Platform, ScrollView, StyleSheet, Switch, Text, View } from "react-native";

import { KairosCard } from "@/components/kairos/card";
import { KairosChip } from "@/components/kairos/chip";
import { PressableScale } from "@/components/kairos/pressable-scale";
import { ScreenHeader } from "@/components/kairos/screen-header";
import { ScreenContainer } from "@/components/screen-container";
import { useAppSettings, useUpdateAppSettings } from "@/hooks/use-settings";
import { useColors } from "@/hooks/use-colors";
import { useThemeContext } from "@/lib/theme-provider";
import { useKairosAuth } from "@/providers/supabase-auth-provider";
import { useKairosUI } from "@/providers/kairos-ui-provider";
import type { ThemePreference } from "@/types/app";
import { parseNotificationSettings } from "@/lib/notification-settings";

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

function SettingsRow({ icon, label, value, onPress }: { icon: keyof typeof MaterialIcons.glyphMap; label: string; value?: string; onPress: () => void }) {
  const colors = useColors();
  return (
    <PressableScale accessibilityLabel={`${label}${value ? `, ${value}` : ""}`} haptic="light" onPress={onPress} style={styles.row}>
      <View style={[styles.rowIcon, { backgroundColor: `${colors.primary}20` }]}><MaterialIcons color={colors.primary} name={icon} size={21} /></View>
      <Text style={[styles.rowLabel, { color: colors.foreground }]}>{label}</Text>
      {value ? <Text style={[styles.rowValue, { color: colors.muted }]}>{value}</Text> : null}
      <MaterialIcons color={colors.tertiary} name="chevron-right" size={23} />
    </PressableScale>
  );
}

export default function SettingsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { themePreference, setColorScheme } = useThemeContext();
  const { signOut } = useKairosAuth();
  const { showToast } = useKairosUI();
  const settings = useAppSettings();
  const updateSettings = useUpdateAppSettings();
  const notifications = useMemo(() => parseNotificationSettings(settings.data?.notifications_enabled ?? {}), [settings.data?.notifications_enabled]);
  const notificationsEnabled = Object.values(notifications).some(Boolean);

  const toggleNotifications = async (enabled: boolean) => {
    try {
      if (enabled && Platform.OS !== "web") {
        if (Platform.OS === "android") {
          await Notifications.setNotificationChannelAsync("kairos-reminders", {
            name: "Kairos reminders",
            importance: Notifications.AndroidImportance.DEFAULT,
          });
        }
        const permission = await Notifications.requestPermissionsAsync();
        if (permission.status !== "granted") throw new Error("Notification permission was not granted.");
      }
      await updateSettings.mutateAsync({
        notifications_enabled: {
          mood_reminder: enabled,
          task_due: enabled,
          ai_update: enabled,
        },
      });
      showToast(enabled ? "Notifications enabled." : "Notifications disabled.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Notification setting could not be changed.", "error");
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      router.replace("/login");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Sign out failed.", "error");
    }
  };

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader showBack title="Settings" subtitle="Privacy, appearance, and account" />
        <KairosCard style={styles.section}>
          <SettingsRow icon="person" label="Profile" onPress={() => router.push("/settings/profile" as Href)} />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <SettingsRow icon="privacy-tip" label="Privacy & data" onPress={() => router.push("/settings/privacy" as Href)} />
        </KairosCard>
        <KairosCard style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Appearance</Text>
          <View style={styles.chips}>{THEMES.map((item) => <KairosChip key={item.value} label={item.label} selected={themePreference === item.value} onPress={() => setColorScheme(item.value)} />)}</View>
        </KairosCard>
        <KairosCard style={styles.section}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleCopy}>
              <Text style={[styles.rowLabel, { color: colors.foreground }]}>Notifications</Text>
              <Text style={[styles.toggleHelp, { color: colors.muted }]}>Mood, tasks, and Evergreen updates</Text>
            </View>
            <Switch
              accessibilityLabel="Enable notifications"
              disabled={updateSettings.isPending}
              onValueChange={(value) => void toggleNotifications(value)}
              trackColor={{ false: colors.border, true: `${colors.primary}99` }}
              thumbColor={notificationsEnabled ? colors.primary : colors.muted}
              value={notificationsEnabled}
            />
          </View>
        </KairosCard>
        <PressableScale accessibilityLabel="Sign out" haptic="medium" onPress={() => void handleSignOut()} style={[styles.signOut, { borderColor: colors.error }]}>
          <MaterialIcons color={colors.error} name="logout" size={21} />
          <Text style={[styles.signOutLabel, { color: colors.error }]}>Sign Out</Text>
        </PressableScale>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16, padding: 20, paddingBottom: 36 },
  section: { gap: 14 },
  sectionTitle: { fontSize: 15, lineHeight: 20, fontFamily: Fonts.serif, fontWeight: "400" },
  row: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 12 },
  rowIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  rowLabel: { flex: 1, fontSize: 15, lineHeight: 20, fontWeight: "700" },
  rowValue: { fontSize: 13, lineHeight: 18 },
  divider: { height: 1 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  toggleRow: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 12 },
  toggleCopy: { flex: 1 },
  toggleHelp: { marginTop: 3, fontSize: 12, lineHeight: 17 },
  signOut: { minHeight: 52, borderRadius: 14, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  signOutLabel: { fontSize: 15, lineHeight: 20, fontWeight: "800" },
});
