import { Fonts } from "@/constants/theme";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import { KairosButton } from "@/components/kairos/button";
import { KairosCard } from "@/components/kairos/card";
import { KairosInput } from "@/components/kairos/input";
import { ScreenHeader } from "@/components/kairos/screen-header";
import { StatePanel } from "@/components/kairos/state-panel";
import { ScreenContainer } from "@/components/screen-container";
import { useAevumAnswer, useAevumConsents, useSaveAevumConsent, useSaveAevumStage } from "@/hooks/use-aevum";
import { useMoods } from "@/hooks/use-moods";
import { useColors } from "@/hooks/use-colors";
import { AEVUM_SAFE_BOUNDARIES, AEVUM_STAGES } from "@/lib/aevum";
import { summarizeAevumBaseline } from "@/lib/aevum-baseline";
import { getAevumErrorMessage } from "@/lib/aevum-errors";
import { useKairosAuth } from "@/providers/supabase-auth-provider";
import { useKairosUI } from "@/providers/kairos-ui-provider";
import type { AevumStageKey } from "@/types/app";

const PROMPTS: Record<AevumStageKey, string> = {
  personality: "When you enter a social setting, what usually helps you feel most like yourself?",
  attachment: "When someone important becomes unexpectedly quiet, what is your first internal response?",
  trauma_patterns: "When someone raises their voice, what do you notice in your body and behaviour?",
  neurodivergence: "Which attention, sensory, communication, or mood pattern would you like Aevum to understand better?",
  baseline: "Describe today's mood, energy, sleep quality, and social battery in your own words.",
  communication: "During disagreement, what do you most often need before you can respond clearly?",
  history_goals: "What relationship pattern or goal would you most like to understand over the next six months?",
};
export default function AevumAssessmentScreen() {
  const colors = useColors(); const router = useRouter(); const { user } = useKairosAuth(); const { showToast } = useKairosUI();
  const params = useLocalSearchParams<{ stage?: string }>();
  const stage = useMemo(() => AEVUM_STAGES.find((s) => s.key === params.stage) ?? AEVUM_STAGES[0], [params.stage]);
  const saveStage = useSaveAevumStage(); const saved = useAevumAnswer(stage.key); const consents = useAevumConsents();
  const moodsQuery = useMoods();
  const baseline = useMemo(() => summarizeAevumBaseline(moodsQuery.data ?? []), [moodsQuery.data]);
  const baselineReady = stage.key !== "baseline" || (!user?.isPreview && !moodsQuery.isLoading && !moodsQuery.isError && baseline.isComplete);
  const saveConsent = useSaveAevumConsent();
  const [answer, setAnswer] = useState(""); const [dirty, setDirty] = useState(false); const [saveError, setSaveError] = useState("");
  useEffect(() => { setAnswer(""); setDirty(false); setSaveError(""); }, [stage.key]);
  useEffect(() => { if (!dirty && saved.data !== undefined) setAnswer(saved.data); }, [dirty, saved.data]);
  const confirmConsent = async () => {
    try { await saveConsent.mutateAsync({ scope: "assessment", granted: true, version: "aevum-2026-09-23" }); showToast(user?.isPreview ? "Consent enabled for this preview session." : "Private reflection consent enabled. You can revoke it in Aevum privacy.", "success"); }
    catch (e) { setSaveError(getAevumErrorMessage(e)); }
  };
  const submit = async () => {
    if (!baselineReady) { setSaveError("Log mood and energy on 14 different recent days before completing this reflection."); return; }
    if (answer.trim().length < 2) { showToast("Add a little more reflection, or pause and return later.", "error"); return; }
    setSaveError("");
    try {
      await saveStage.mutateAsync({ stageKey: stage.key, questionKey: `${stage.key}_reflection`, answer: answer.trim() });
      setDirty(false);
      showToast(user?.isPreview ? "Preview reflection saved for this session only. It is not synced and clears on refresh or exit." : `${stage.title} saved privately.`, "success");
    } catch (error) { const message = getAevumErrorMessage(error); setSaveError(message); showToast(message, "error"); }
  };
  return <ScreenContainer><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <ScreenHeader showBack title={stage.title} subtitle="Private guided reflection" />
    <KairosCard style={styles.card}>
      <Text style={[styles.disclaimer, { color: colors.warning }]}>{AEVUM_SAFE_BOUNDARIES.screening}</Text>
      <Text style={[styles.help, { color: colors.muted }]}>This is one guided reflection, not the full validated assessment inventory. Saving marks this reflection complete; it does not produce a diagnosis or a complete psychological map.</Text>
      {stage.key === "baseline" ? (
        <KairosCard style={styles.baselineCard}>
          <Text style={[styles.prompt, { color: colors.foreground }]}>Observed daily check-ins</Text>
          {moodsQuery.isLoading ? <StatePanel loading title="Loading check-ins" message="Checking your saved mood and energy entries…" /> : null}
          {moodsQuery.isError ? <StatePanel title="Baseline data unavailable" message="Retry before completing this stage. No missing values will be estimated." actionLabel="Retry" onAction={() => void moodsQuery.refetch()} /> : null}
          {!moodsQuery.isLoading && !moodsQuery.isError ? (
            <>
              <Text style={[styles.help, { color: colors.foreground }]}>{user?.isPreview ? "Preview mode cannot save daily mood records." : `${baseline.daysTracked} of 14 recent calendar days include both mood and energy.`}</Text>
              <Text style={[styles.help, { color: colors.muted }]}>
                {baseline.moodAverage !== null ? `Observed mood average: ${baseline.moodAverage}/10. ` : "Mood average unavailable. "}
                {baseline.energyAverage !== null ? `Observed energy average: ${baseline.energyAverage}/10.` : "Energy average unavailable."}
              </Text>
              <Text style={[styles.help, { color: colors.muted }]}>Only recorded entries count; this is personal reflection, not a clinical instrument or diagnosis.</Text>
              {!baseline.isComplete && !user?.isPreview ? <KairosButton label="Log today's mood & energy" tone="secondary" onPress={() => router.push("/mood/log")} /> : null}
            </>
          ) : null}
        </KairosCard>
      ) : null}
      {user?.isPreview ? <Text style={[styles.help, { color: colors.warning }]}>Preview: entries stay in app memory for this session only. Refreshing or exiting preview clears them. Use test text rather than sensitive real answers.</Text> : null}
      {saved.isLoading || consents.isLoading ? <StatePanel loading title="Loading private reflection" message="Checking your saved answer and consent…" /> : null}
      {saved.isError ? <StatePanel title="Saved answer could not be loaded" message={getAevumErrorMessage(saved.error)} actionLabel="Retry loading" onAction={() => void saved.refetch()} /> : null}
      {consents.isError ? <StatePanel title="Consent could not be checked" message={getAevumErrorMessage(consents.error)} actionLabel="Retry consent check" onAction={() => void consents.refetch()} /> : null}
      <Text style={[styles.prompt, { color: colors.foreground }]}>{PROMPTS[stage.key]}</Text>
      <KairosInput label="Your private reflection" value={answer} onChangeText={(value) => { setDirty(true); setAnswer(value); }} editable={!saveStage.isPending} multiline numberOfLines={7} maxLength={2000} placeholder="There is no right answer. Use your own words." accessibilityHint="Your reflection stays private; partner sharing never includes raw assessment answers" />
      {!consents.data?.assessment ? <><Text style={[styles.help, { color: colors.muted }]}>By confirming, you allow Kairos to store this private reflection for relationship education only. It is not diagnosis or therapy, is never shared automatically with your partner, and you can revoke permission or delete your answers in Aevum privacy. You may skip difficult experiences and seek qualified support.</Text><KairosButton label="I agree to private reflection storage" tone="secondary" loading={saveConsent.isPending} disabled={consents.isLoading || consents.isError} onPress={() => void confirmConsent()} /></> : null}
      <Text style={[styles.help, { color: colors.muted }]}>Your partner cannot read this answer. If a save fails, your text stays here while you retry; it is not silently saved elsewhere.</Text>
      {saveError ? <Text accessibilityRole="alert" style={[styles.help, { color: colors.error }]}>{saveError}</Text> : null}
      <KairosButton label={user?.isPreview ? "Save preview reflection" : "Save stage privately"} onPress={() => void submit()} loading={saveStage.isPending} disabled={!consents.data?.assessment || saved.isLoading || saved.isError || answer.trim().length < 2 || !baselineReady} />
      <KairosButton label="Return to Connection" tone="secondary" onPress={() => router.replace("/connection" as Href)} />
    </KairosCard>
  </ScrollView></ScreenContainer>;
}
const styles = StyleSheet.create({ content: { padding: 16, gap: 16, paddingBottom: 32 }, card: { gap: 16, padding: 18 }, baselineCard: { gap: 12, padding: 16 }, disclaimer: { fontSize: 13, lineHeight: 19, fontWeight: "700" }, prompt: { fontSize: 22, lineHeight: 29, fontFamily: Fonts.serif, fontWeight: "400" }, help: { fontSize: 13, lineHeight: 19 } });
