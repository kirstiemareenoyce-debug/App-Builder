import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";

import { KairosButton } from "@/components/kairos/button";
import { KairosCard } from "@/components/kairos/card";
import { DateTimeField } from "@/components/kairos/date-time-field";
import { KairosInput } from "@/components/kairos/input";
import { ScreenHeader } from "@/components/kairos/screen-header";
import { KairosSlider } from "@/components/kairos/slider";
import { ScreenContainer } from "@/components/screen-container";
import { useCreateSleepLog } from "@/hooks/use-sleep";
import { useColors } from "@/hooks/use-colors";
import { formatDuration } from "@/lib/date";
import { useKairosUI } from "@/providers/kairos-ui-provider";
import { sleepEntrySchema } from "@/lib/frontend-validation";

export default function SleepLogScreen() {
  const colors = useColors();
  const router = useRouter();
  const { showToast } = useKairosUI();
  const createSleep = useCreateSleepLog();
  const defaultWake = new Date();
  const defaultBed = new Date(defaultWake.getTime() - 8 * 60 * 60 * 1000);
  const [duration, setDuration] = useState(480);
  const [quality, setQuality] = useState(7);
  const [bedtime, setBedtime] = useState(defaultBed);
  const [wakeTime, setWakeTime] = useState(defaultWake);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const parsed = sleepEntrySchema.safeParse({ duration_minutes: duration, quality, bedtime, wake_time: wakeTime, notes });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check your sleep entry.");
      return;
    }
    try {
      setError(null);
      await createSleep.mutateAsync({
        duration_minutes: parsed.data.duration_minutes,
        quality: parsed.data.quality,
        bedtime: parsed.data.bedtime.toISOString(),
        wake_time: parsed.data.wake_time.toISOString(),
        notes: parsed.data.notes || null,
        logged_at: new Date().toISOString(),
      });
      if (Platform.OS !== "web") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast("Sleep logged.", "success");
      router.back();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Sleep could not be logged.");
    }
  };

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ScreenHeader showBack title="Log sleep" subtitle="Rest and recovery" rightAction={{ icon: "history", label: "View sleep history", onPress: () => router.push("/sleep/history") }} />
        <KairosCard style={styles.form}>
          <KairosSlider label="Duration" value={duration} valueLabel={formatDuration(duration)} minimumValue={0} maximumValue={720} step={15} minimumLabel="0h" maximumLabel="12h" onValueChange={setDuration} />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <KairosSlider label="Sleep quality" value={quality} minimumValue={1} maximumValue={10} step={1} minimumLabel="Restless" maximumLabel="Restorative" onValueChange={setQuality} />
          <DateTimeField label="Bedtime" mode="time" value={bedtime} onChange={setBedtime} />
          <DateTimeField label="Wake time" mode="time" value={wakeTime} onChange={setWakeTime} />
          <KairosInput label="Notes (optional)" multiline maxLength={1000} onChangeText={setNotes} placeholder="Anything that affected your sleep?" value={notes} />
          {error ? <Text accessibilityLiveRegion="assertive" style={[styles.error, { color: colors.error }]}>{error}</Text> : null}
          <KairosButton label="Log Sleep" loading={createSleep.isPending} onPress={() => void submit()} />
        </KairosCard>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { gap: 18, padding: 20, paddingBottom: 36 },
  form: { gap: 22 },
  divider: { height: 1 },
  error: { fontSize: 13, lineHeight: 18 },
});
