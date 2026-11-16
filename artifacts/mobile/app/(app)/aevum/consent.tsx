import { Fonts } from "@/constants/theme";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";

import { KairosButton } from "@/components/kairos/button";
import { KairosCard } from "@/components/kairos/card";
import { ScreenHeader } from "@/components/kairos/screen-header";
import { ScreenContainer } from "@/components/screen-container";
import { useSaveAevumConsent } from "@/hooks/use-aevum";
import { useColors } from "@/hooks/use-colors";
import { AEVUM_SAFE_BOUNDARIES } from "@/lib/aevum";
import { useKairosUI } from "@/providers/kairos-ui-provider";
import { useKairosAuth } from "@/providers/supabase-auth-provider";

export default function AevumConsentScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user } = useKairosAuth();
  const { showToast } = useKairosUI();
  const saveConsent = useSaveAevumConsent();
  const [confirmed, setConfirmed] = useState(false);
  const continueFlow = async () => {
    if (!confirmed) return;
    try {
      await saveConsent.mutateAsync({ scope: "assessment", granted: true, version: "aevum-2026-09-23" });
      await saveConsent.mutateAsync({ scope: "individual_profile", granted: true, version: "aevum-2026-09-23" });
      showToast(user?.isPreview ? "Preview consent recorded for this session only." : "Consent recorded. You can revoke it from Aevum privacy settings.", "success");
      router.replace("/aevum/assessment");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Consent could not be saved.", "error");
    }
  };
  return <ScreenContainer><ScrollView contentContainerStyle={styles.content}><ScreenHeader showBack title="Before you begin" subtitle="Aevum is designed for reflection, not diagnosis." /><KairosCard style={styles.card}><Text style={[styles.heading, { color: colors.foreground }]}>What you are agreeing to</Text><Text style={[styles.body, { color: colors.muted }]}>Aevum uses screening-style questions to identify relationship patterns and personalise educational coaching. It does not diagnose ADHD, autism, bipolar disorder, OCD, PTSD, attachment disorders, or any other condition.</Text><Text style={[styles.body, { color: colors.muted }]}>{AEVUM_SAFE_BOUNDARIES.privacy}</Text><Text style={[styles.body, { color: colors.muted }]}>{AEVUM_SAFE_BOUNDARIES.safety}</Text><Text style={[styles.notice, { color: colors.warning }]}>Some questions may touch on difficult experiences. You may pause, skip a prompt, or stop. If you are in immediate danger or thinking about harming yourself, contact local emergency services or a crisis service now.</Text><KairosButton label={confirmed ? "Consent confirmed" : "I understand and want to continue"} onPress={() => setConfirmed((value) => !value)} tone={confirmed ? "secondary" : "primary"} accessibilityHint="Toggle informed consent" /><KairosButton label="Continue to Aevum" onPress={() => void continueFlow()} loading={saveConsent.isPending} disabled={!confirmed} /></KairosCard></ScrollView></ScreenContainer>;
}

const styles = StyleSheet.create({ content: { padding: 16, gap: 16 }, card: { gap: 16, padding: 20 }, heading: { fontSize: 22, lineHeight: 28, fontFamily: Fonts.serif, fontWeight: "400" }, body: { fontSize: 15, lineHeight: 23 }, notice: { fontSize: 13, lineHeight: 19, fontWeight: "700" } });
