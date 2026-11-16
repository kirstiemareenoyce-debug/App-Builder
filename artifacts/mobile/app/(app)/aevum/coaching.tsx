import { Fonts } from "@/constants/theme";
import { useRouter, type Href } from "expo-router";
import { useState } from "react";
import { Platform, ScrollView, StyleSheet, Switch, Text, View } from "react-native";

import { KairosButton } from "@/components/kairos/button";
import { KairosCard } from "@/components/kairos/card";
import { KairosInput } from "@/components/kairos/input";
import { ScreenHeader } from "@/components/kairos/screen-header";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useSaveAevumConsent } from "@/hooks/use-aevum";
import { useAevumCoachingMutation } from "@/hooks/use-aevum-coaching";
import { AEVUM_SAFE_BOUNDARIES } from "@/lib/aevum";
import { SUMMARY_EXPORT_PRIVACY, type SafeSummary, type SummaryExportFormat } from "@/lib/aevum-summary";
import { exportSafeSummary } from "@/lib/aevum-summary-export";
import { copySafeSummary } from "@/lib/aevum-summary-clipboard";
import { useKairosAuth } from "@/providers/supabase-auth-provider";
import { useKairosUI } from "@/providers/kairos-ui-provider";

export default function AevumCoachingScreen() {
  const colors = useColors();
  const router = useRouter();
  const { showToast } = useKairosUI();
  const { user } = useKairosAuth();
  const saveConsent = useSaveAevumConsent();
  const { mutateAsync: requestAevumCoaching } = useAevumCoachingMutation();
  const [prompt, setPrompt] = useState("");
  const [safeSummary, setSafeSummary] = useState<SafeSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<SummaryExportFormat | null>(null);
  const [copying, setCopying] = useState(false);
  const [privacyAcknowledged, setPrivacyAcknowledged] = useState(false);

  const enableCoaching = async () => {
    try {
      await saveConsent.mutateAsync({ scope: "coaching", granted: true, version: "aevum-2026-09-23" });
      showToast("Coaching consent recorded. You can revoke it later.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Coaching consent could not be saved.", "error");
    }
  };

  const askCoach = async () => {
    if (!user || user.isPreview) {
      showToast("Preview mode: live coaching is unavailable. Restore Supabase and sign in to use the coach.", "info");
      return;
    }
    if (prompt.trim().length < 3) {
      showToast("Write a little more about what you want help with.", "error");
      return;
    }
    // Capture ownership at Send, before any asynchronous mutation startup.
    const expectedOwner = user.id;
    setLoading(true);
    setSafeSummary(null);
    setPrivacyAcknowledged(false);
    try {
      const result = await requestAevumCoaching({ expectedOwner, mode: "individual_reflection", prompt: prompt.trim(), context: { sharedGoals: ["Understand my relationship patterns safely"] } });
      setSafeSummary({ summary: result.response, generatedAt: new Date().toISOString() });
      if (result.escalated) showToast("Aevum has directed you to immediate support.", "error");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Aevum Coach is unavailable.", "error");
    } finally {
      setLoading(false);
    }
  };

  const exportSummary = async (format: SummaryExportFormat) => {
    if (!safeSummary || loading || exporting || copying || !privacyAcknowledged) return;
    setExporting(format);
    try {
      await exportSafeSummary(safeSummary, format);
      showToast(Platform.OS === "web" ? "Download started. Check your browser downloads." : "Share sheet closed. If you saved the file, keep it somewhere private.", "info");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "The summary could not be exported. Please try again.", "error");
    } finally {
      setExporting(null);
    }
  };

  const copySummary = async () => {
    if (!safeSummary || loading || exporting || copying || !privacyAcknowledged) return;
    setCopying(true);
    try {
      await copySafeSummary(safeSummary);
      showToast("Summary copied to clipboard. Paste it only where you trust the recipient.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not copy the summary. Try the text export instead.", "error");
    } finally {
      setCopying(false);
    }
  };

  const previewSample = () => {
    setSafeSummary({
      summary: "Pause before replying during a difficult conversation. Agree on a short break and a time to return.\n\nWhen you return, each person can describe one feeling and one practical need without assigning blame. This sample is for testing exports only; it is not personalised coaching.",
      generatedAt: new Date().toISOString(), isSample: true,
    });
    setPrivacyAcknowledged(false);
    showToast("Preview sample loaded. No AI request was made.", "info");
  };

  const exportDisabled = !safeSummary || !privacyAcknowledged || loading || exporting !== null || copying;

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ScreenHeader showBack title="Aevum Coach" subtitle="Personalised education with clear limits" />
        <KairosCard style={styles.card}>
          <Text style={[styles.heading, { color: colors.foreground }]}>Your coach is not a therapist</Text>
          <Text style={[styles.body, { color: colors.muted }]}>Aevum sends only the minimum structured context allowed by your consent. It does not send full raw assessment responses to general Evergreen chat, and it does not diagnose or provide emergency care.</Text>
          <Text style={[styles.body, { color: colors.muted }]}>{AEVUM_SAFE_BOUNDARIES.safety}</Text>
          <KairosButton label="Enable coaching consent" onPress={() => void enableCoaching()} loading={saveConsent.isPending} tone="secondary" />
          <KairosInput label="What would you like to understand?" value={prompt} onChangeText={setPrompt} multiline numberOfLines={4} maxLength={2000} placeholder="For example: How can I slow down a difficult conversation?" />
          <KairosButton label="Ask Aevum Coach" onPress={() => void askCoach()} loading={loading} disabled={prompt.trim().length < 3 || exporting !== null || copying} />
          {user?.isPreview ? <KairosButton label="Load sample summary to test exports" onPress={previewSample} disabled={exporting !== null || copying} tone="secondary" /> : null}
          {safeSummary ? (
            <KairosCard style={[styles.response, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.responseLabel, { color: colors.primary }]}>{safeSummary.isSample ? "Preview sample — not personalised" : "Your coaching safe summary"}</Text>
              <Text selectable style={[styles.body, { color: colors.foreground }]}>{safeSummary.summary}</Text>
            </KairosCard>
          ) : null}
          <KairosCard style={styles.exportCard}>
            <Text style={[styles.exportHeading, { color: colors.foreground }]}>Share safe summary</Text>
            <Text style={[styles.body, { color: colors.muted }]}>{safeSummary ? "Copy the summary above or download a PDF or text file. Only the displayed summary is included—not your original prompt, assessment answers, or account details." : "Copy and export options will be available here after a coaching response. In preview mode, load the clearly labelled sample to test sharing."}</Text>
            <Text style={[styles.notice, { color: colors.muted }]}>{SUMMARY_EXPORT_PRIVACY}</Text>
            <Text style={[styles.notice, { color: colors.muted }]}>Clipboard copies may be visible to other apps or sync between your devices. Kairos does not read or automatically clear your clipboard. Copying replaces its current contents.</Text>
            <View style={styles.acknowledgement}>
              <Text style={[styles.acknowledgementLabel, { color: colors.foreground }]}>I understand copied summaries and exported files may contain personal information.</Text>
              <Switch value={privacyAcknowledged} onValueChange={setPrivacyAcknowledged} disabled={!safeSummary || loading || exporting !== null || copying} accessibilityLabel="Acknowledge privacy of copied and exported summaries" trackColor={{ true: colors.primary, false: colors.border }} />
            </View>
            <KairosButton label="Copy to Clipboard" icon="content-copy" onPress={() => void copySummary()} disabled={exportDisabled} loading={copying} tone="secondary" accessibilityHint="Copy only the displayed coaching summary as plain text for pasting into another app" />
            <KairosButton label="Export as PDF" icon="picture-as-pdf" onPress={() => void exportSummary("pdf")} disabled={exportDisabled} loading={exporting === "pdf"} accessibilityHint="Save or share only the displayed coaching summary as a PDF file" />
            <KairosButton label="Export as text" icon="description" onPress={() => void exportSummary("text")} disabled={exportDisabled} loading={exporting === "text"} tone="secondary" accessibilityHint="Save or share only the displayed coaching summary as a UTF-8 text file" />
          </KairosCard>
          <KairosButton label="Review general consent" onPress={() => router.push("/aevum/consent")} tone="secondary" />
          <KairosButton label="Return to Connection" tone="secondary" onPress={() => router.replace("/connection" as Href)} />
        </KairosCard>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16, paddingBottom: 32 },
  card: { gap: 16, padding: 20 },
  heading: { fontSize: 22, lineHeight: 28, fontFamily: Fonts.serif, fontWeight: "400" },
  body: { fontSize: 14, lineHeight: 21 },
  response: { gap: 8, padding: 14 },
  responseLabel: { fontSize: 12, lineHeight: 18, fontWeight: "900", textTransform: "uppercase" },
  exportCard: { gap: 12, padding: 16 },
  exportHeading: { fontSize: 18, lineHeight: 24, fontWeight: "800" },
  notice: { fontSize: 12, lineHeight: 18 },
  acknowledgement: { flexDirection: "row", gap: 12, alignItems: "center" },
  acknowledgementLabel: { flex: 1, fontSize: 13, lineHeight: 19 },
});
