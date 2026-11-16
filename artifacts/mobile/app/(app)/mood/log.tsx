import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";

import { KairosButton } from "@/components/kairos/button";
import { KairosCard } from "@/components/kairos/card";
import { KairosInput } from "@/components/kairos/input";
import { ScreenHeader } from "@/components/kairos/screen-header";
import { KairosSlider } from "@/components/kairos/slider";
import { ScreenContainer } from "@/components/screen-container";
import { useMoods, useCreateMood } from "@/hooks/use-moods";
import { useColors } from "@/hooks/use-colors";
import { useKairosUI } from "@/providers/kairos-ui-provider";
import { moodEntrySchema } from "@/lib/frontend-validation";

export default function MoodLogScreen() {
  const colors = useColors();
  const router = useRouter();
  const { showToast } = useKairosUI();
  const createMood = useCreateMood();
  const moods = useMoods();
  const [score, setScore] = useState(6);
  const [energy, setEnergy] = useState(6);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const parsed = moodEntrySchema.safeParse({ score, energy_level: energy, notes });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check your mood entry.");
      return;
    }
    try {
      setError(null);
      await createMood.mutateAsync({
        score: parsed.data.score,
        energy_level: parsed.data.energy_level,
        notes: parsed.data.notes || null,
        logged_at: new Date().toISOString(),
      });
      if (Platform.OS !== "web") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast("Mood logged.", "success");
      router.back();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Mood could not be logged.");
    }
  };

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ScreenHeader showBack title="Log mood" subtitle="A quick check-in for today" rightAction={{ icon: "history", label: "View mood history", onPress: () => router.push("/mood/history") }} />
        <KairosCard style={styles.form}>
          <KairosSlider label="Mood score" value={score} minimumValue={1} maximumValue={10} step={1} minimumLabel="Terrible" maximumLabel="Excellent" onValueChange={setScore} />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <KairosSlider label="Energy" value={energy} minimumValue={1} maximumValue={10} step={1} minimumLabel="Exhausted" maximumLabel="Peak" onValueChange={setEnergy} />
          <KairosInput label="Notes (optional)" multiline maxLength={1000} onChangeText={setNotes} placeholder="What is shaping today?" value={notes} />
          {error ? <Text accessibilityLiveRegion="assertive" style={[styles.error, { color: colors.error }]}>{error}</Text> : null}
          <KairosButton label="Log Mood" loading={createMood.isPending} onPress={() => void submit()} />
        </KairosCard>
        {moods.data?.[0] ? <Text style={[styles.helper, { color: colors.muted }]}>Last check-in: {new Date(moods.data[0].logged_at).toLocaleDateString("en-AU")}</Text> : null}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { gap: 18, padding: 20, paddingBottom: 36 },
  form: { gap: 22 },
  divider: { height: 1 },
  error: { fontSize: 13, lineHeight: 18 },
  helper: { fontSize: 13, lineHeight: 18, textAlign: "center" },
});
