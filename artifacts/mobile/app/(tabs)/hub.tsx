import { Fonts } from "@/constants/theme";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter, type Href } from "expo-router";
import { useMemo } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { KairosCard } from "@/components/kairos/card";
import { PressableScale } from "@/components/kairos/pressable-scale";
import { ScreenHeader } from "@/components/kairos/screen-header";
import { ScreenContainer } from "@/components/screen-container";
import { useMoods } from "@/hooks/use-moods";
import { useSleepLogs } from "@/hooks/use-sleep";
import { useColors } from "@/hooks/use-colors";
import { average, formatDuration, sevenDaysAgoIso } from "@/lib/date";
import { useKairosAuth } from "@/providers/supabase-auth-provider";
import { useKairosUI } from "@/providers/kairos-ui-provider";

const HUB_SECTIONS: {
  key: string;
  title: string;
  subtitle: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  href: Href;
}[] = [
  { key: "kairos-ai", title: "Kairos AI", subtitle: "Understand yourself and choose what to share", icon: "psychology", href: "/assistants/kairos" as Href },
  { key: "evergreen-ai", title: "Evergreen AI", subtitle: "Everyday questions and practical next steps", icon: "auto-awesome", href: "/assistants/evergreen" as Href },
  { key: "individual-intake", title: "Individual questionnaires", subtitle: "Your private adult core, results and self-description", icon: "fact-check", href: "/individual" as Href },
  { key: "support-profile", title: "How to support me", subtitle: "Your words, needs and boundaries — reviewed by you", icon: "volunteer-activism", href: "/assistants/support-profile" as Href },
  { key: "mood", title: "Mood & energy", subtitle: "Check in with yourself", icon: "mood", href: "/mood/log" as Href },
  { key: "sleep", title: "Sleep", subtitle: "Record rest and recovery", icon: "bedtime", href: "/sleep/log" as Href },
  { key: "personal-tasks", title: "Personal tasks", subtitle: "Choose a personal next step", icon: "check-circle-outline", href: "/tasks" as Href },
  { key: "notes", title: "Notes", subtitle: "Keep a private record", icon: "sticky-note-2", href: "/notes" as Href },
  { key: "settings", title: "Profile & settings", subtitle: "Manage your account and preferences", icon: "manage-accounts", href: "/settings" as Href },
  { key: "life-planner", title: "Life Planner", subtitle: "Turn a personal goal into a next step", icon: "event-note", href: "/planner" as Href },
];

export default function MyLifeTabScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user, signOut } = useKairosAuth();
  const { showToast } = useKairosUI();
  const moods = useMoods();
  const sleep = useSleepLogs();
  const sevenDaysAgo = sevenDaysAgoIso();
  const moodAverage = useMemo(() => average((moods.data ?? []).filter((item) => item.logged_at >= sevenDaysAgo).map((item) => item.score)), [moods.data, sevenDaysAgo]);
  const sleepAverage = useMemo(() => average((sleep.data ?? []).filter((item) => item.logged_at >= sevenDaysAgo).map((item) => item.duration_minutes)), [sevenDaysAgo, sleep.data]);
  const name = user?.fullName?.trim() || "Your space";

  const handleSignOut = async () => {
    try {
      await signOut();
      router.replace("/login");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Sign out failed.", "error");
    }
  };

  return (
    <ScreenContainer edges={["top", "left", "right"]} header={<ScreenHeader title="My Life" />}>
      <FlatList
        data={HUB_SECTIONS}
        numColumns={2}
        keyExtractor={(item) => item.key}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.headerArea}>
            <View style={styles.header}>
              <View style={styles.headerCopy}>
                <Text style={[styles.eyebrow, { color: colors.primary }]}>YOUR PRIVATE SPACE</Text>
                <Text accessibilityRole="header" style={[styles.title, { color: colors.foreground }]}>{name}</Text>
              </View>
              <View style={[styles.avatar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.avatarText, { color: colors.primary }]}>{(user?.fullName ?? "K").slice(0, 1).toUpperCase()}</Text>
              </View>
            </View>
            <Text style={[styles.subtitle, { color: colors.muted }]}>Understand yourself, care for your daily life, and choose what helps others support you.</Text>
            <KairosCard style={styles.privacyCard}>
              <View style={[styles.privacyIcon, { borderColor: colors.border, backgroundColor: `${colors.primary}12` }]}>
                <MaterialIcons name="lock-outline" size={22} color={colors.primary} />
              </View>
              <View style={styles.privacyCopy}>
                <Text style={[styles.privacyTitle, { color: colors.foreground }]}>Private by default</Text>
                <Text style={[styles.privacyBody, { color: colors.muted }]}>Your personal records stay yours. Sharing is always a separate, deliberate choice.</Text>
              </View>
            </KairosCard>
            <View style={styles.statsRow}>
              <KairosCard style={styles.statCard}>
                <Text style={[styles.statLabel, { color: colors.muted }]}>7-day mood</Text>
                <Text style={[styles.statValue, { color: colors.foreground }]}>{moodAverage === null ? "—" : `${moodAverage.toFixed(1)}/10`}</Text>
              </KairosCard>
              <KairosCard style={styles.statCard}>
                <Text style={[styles.statLabel, { color: colors.muted }]}>7-day sleep</Text>
                <Text style={[styles.statValue, { color: colors.foreground }]}>{sleepAverage === null ? "—" : formatDuration(Math.round(sleepAverage))}</Text>
              </KairosCard>
            </View>
            <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.primary }]}>MY LIFE</Text>
          </View>
        }
        renderItem={({ item }) => (
          <PressableScale
            accessibilityLabel={`${item.title}. ${item.subtitle}`}
            accessibilityRole="button"
            onPress={() => router.push(item.href)}
            style={styles.gridItem}
          >
            <KairosCard style={styles.hubCard}>
              <View style={[styles.iconCircle, { backgroundColor: `${colors.primary}20` }]}>
                <MaterialIcons color={colors.primary} name={item.icon} size={27} />
              </View>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>{item.title}</Text>
              <Text style={[styles.cardBody, { color: colors.muted }]}>{item.subtitle}</Text>
            </KairosCard>
          </PressableScale>
        )}
        ListFooterComponent={
          <View style={styles.footer}>
            <PressableScale accessibilityLabel="Sign out" onPress={() => void handleSignOut()} style={styles.signOut}>
              <Text style={[styles.signOutLabel, { color: colors.error }]}>Sign Out</Text>
            </PressableScale>
          </View>
        }
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 116 },
  headerArea: { gap: 16, marginBottom: 14 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  headerCopy: { flex: 1, gap: 4 },
  eyebrow: { fontSize: 10, lineHeight: 15, fontWeight: "800", letterSpacing: 1.9 },
  title: { fontFamily: Fonts.serif, fontSize: 30, lineHeight: 38, fontWeight: "400" },
  subtitle: { maxWidth: 380, fontSize: 14, lineHeight: 20 },
  avatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 17, lineHeight: 22, fontWeight: "900" },
  privacyCard: { flexDirection: "row", alignItems: "flex-start", gap: 13, borderRadius: 17, padding: 16 },
  privacyIcon: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  privacyCopy: { flex: 1, gap: 4 },
  privacyTitle: { fontSize: 15, lineHeight: 20, fontWeight: "700" },
  privacyBody: { fontSize: 13, lineHeight: 19 },
  statsRow: { flexDirection: "row", gap: 12 },
  statCard: { flex: 1, minHeight: 92, justifyContent: "space-between" },
  statLabel: { fontSize: 12, lineHeight: 17, fontWeight: "600" },
  statValue: { fontSize: 22, lineHeight: 28, fontWeight: "900" },
  sectionTitle: { fontSize: 11, lineHeight: 16, letterSpacing: 1.8, fontWeight: "800", marginTop: 3 },
  gridRow: { gap: 12 },
  gridItem: { flex: 1, marginBottom: 12 },
  hubCard: { minHeight: 156, gap: 10 },
  iconCircle: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 18, lineHeight: 23, fontWeight: "800" },
  cardBody: { fontSize: 13, lineHeight: 18 },
  footer: { gap: 12, paddingTop: 4 },
  signOut: { minHeight: 48, alignItems: "center", justifyContent: "center" },
  signOutLabel: { fontSize: 15, lineHeight: 20, fontWeight: "700" },
});
