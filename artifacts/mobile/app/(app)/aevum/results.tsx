import { Fonts } from "@/constants/theme";
import { useRouter, type Href } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { KairosCard } from "@/components/kairos/card";
import { KairosButton } from "@/components/kairos/button";
import { ScreenHeader } from "@/components/kairos/screen-header";
import { ScreenContainer } from "@/components/screen-container";
import { useAevumProfile } from "@/hooks/use-aevum";
import { useColors } from "@/hooks/use-colors";
import { AEVUM_SAFE_BOUNDARIES } from "@/lib/aevum";

export default function AevumResultsScreen() {
  const colors = useColors();
  const router = useRouter();
  const profileQuery = useAevumProfile();
  const profile = profileQuery.data;
  return <ScreenContainer><ScrollView contentContainerStyle={styles.content}><ScreenHeader showBack title="Individual profile" subtitle="Patterns for reflection, not labels" />{!profile ? <KairosCard style={styles.card}><Text style={[styles.heading, { color: colors.foreground }]}>Your profile is still being built</Text><Text style={[styles.body, { color: colors.muted }]}>Complete the seven-stage foundation before Aevum presents an individual readiness report. Missing information will remain unavailable rather than being guessed.</Text><KairosButton label="Return to Connection" onPress={() => router.replace("/connection" as Href)} /></KairosCard> : <><KairosCard style={styles.card}><Text style={[styles.heading, { color: colors.foreground }]}>Profile progress: {Math.round(profile.completion_progress * 100)}%</Text><Text style={[styles.body, { color: colors.muted }]}>Aevum will show stage summaries here as they become available. Raw responses remain private to you.</Text><Text style={[styles.notice, { color: colors.warning }]}>{AEVUM_SAFE_BOUNDARIES.screening}</Text></KairosCard><View style={styles.list}>{Object.entries(profile.stage_status).map(([key, status]) => <KairosCard key={key} style={styles.row}><Text style={[styles.rowTitle, { color: colors.foreground }]}>{key.replaceAll("_", " ")}</Text><Text style={[styles.body, { color: colors.muted }]}>{status === "completed" ? "Completed; summary pending safe review." : "Not complete."}</Text></KairosCard>)}</View></>}</ScrollView></ScreenContainer>;
}
const styles = StyleSheet.create({ content: { padding: 16, gap: 16 }, card: { gap: 12, padding: 18 }, heading: { fontSize: 22, lineHeight: 28, fontFamily: Fonts.serif, fontWeight: "400" }, body: { fontSize: 14, lineHeight: 21 }, notice: { fontSize: 13, lineHeight: 19, fontWeight: "700" }, list: { gap: 10 }, row: { gap: 4 }, rowTitle: { fontSize: 16, lineHeight: 21, fontWeight: "800", textTransform: "capitalize" } });
