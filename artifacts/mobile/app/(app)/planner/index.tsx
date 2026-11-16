import { Fonts } from "@/constants/theme";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";

import { KairosButton } from "@/components/kairos/button";
import { KairosCard } from "@/components/kairos/card";
import { KairosChip } from "@/components/kairos/chip";
import { DateTimeField } from "@/components/kairos/date-time-field";
import { KairosInput } from "@/components/kairos/input";
import { PressableScale } from "@/components/kairos/pressable-scale";
import { ScreenHeader } from "@/components/kairos/screen-header";
import { StatePanel } from "@/components/kairos/state-panel";
import { ScreenContainer } from "@/components/screen-container";
import { useCreateTask, useTasks } from "@/hooks/use-tasks";
import { useMoods } from "@/hooks/use-moods";
import { useSleepLogs } from "@/hooks/use-sleep";
import { useColors } from "@/hooks/use-colors";
import { average, formatDuration, sevenDaysAgoIso } from "@/lib/date";
import { buildLifePlanTask, LIFE_PLAN_AREAS, type LifePlanArea } from "@/lib/life-planner";
import { useKairosAuth } from "@/providers/supabase-auth-provider";
import { useKairosUI } from "@/providers/kairos-ui-provider";
import type { Task } from "@/types/app";

const AREA_LABELS: Record<LifePlanArea, string> = {
  work: "Work",
  relationship: "Relationship",
  personal: "Personal",
};
const AREA_FILTERS = ["all", ...LIFE_PLAN_AREAS] as const;

type AreaFilter = (typeof AREA_FILTERS)[number];

function isOpen(task: Task) {
  return task.status !== "done" && task.status !== "cancelled";
}

function taskArea(task: Task) {
  return LIFE_PLAN_AREAS.find((area) => task.tags.includes(area));
}

export default function LifePlannerScreen() {
  const router = useRouter();
  const colors = useColors();
  const { user } = useKairosAuth();
  const { showToast } = useKairosUI();
  const tasksQuery = useTasks();
  const createTask = useCreateTask();
  const moodsQuery = useMoods();
  const sleepQuery = useSleepLogs();
  const [area, setArea] = useState<LifePlanArea>("work");
  const [filter, setFilter] = useState<AreaFilter>("all");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sevenDaysAgo = sevenDaysAgoIso();
  const moodAverage = useMemo(
    () => average((moodsQuery.data ?? []).filter((item) => item.logged_at >= sevenDaysAgo).map((item) => item.score)),
    [moodsQuery.data, sevenDaysAgo],
  );
  const sleepAverage = useMemo(
    () => average((sleepQuery.data ?? []).filter((item) => item.logged_at >= sevenDaysAgo).map((item) => item.duration_minutes)),
    [sleepQuery.data, sevenDaysAgo],
  );
  const openTasks = useMemo(() => {
    const items = (tasksQuery.data ?? []).filter(isOpen);
    return filter === "all" ? items : items.filter((task) => taskArea(task) === filter);
  }, [filter, tasksQuery.data]);

  const save = async () => {
    setError(null);
    try {
      const payload = buildLifePlanTask({ title, description, area, dueDate });
      await createTask.mutateAsync(payload);
      setTitle("");
      setDescription("");
      setDueDate(null);
      showToast("Private next step saved to your tasks.", "success");
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "This next step could not be saved.";
      setError(message);
      showToast(message, "error");
    }
  };

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ScreenHeader showBack title="Life planner" subtitle="One calm next step for work, relationships, or you" />

          <KairosCard style={styles.card}>
            <View style={styles.rowTitle}>
              <View style={[styles.iconCircle, { backgroundColor: `${colors.primary}20` }]}>
                <MaterialIcons color={colors.primary} name="auto-awesome" size={23} />
              </View>
              <Text style={[styles.heading, { color: colors.foreground }]}>Choose a place to begin</Text>
            </View>
            <View style={styles.chips}>
              {LIFE_PLAN_AREAS.map((item) => (
                <KairosChip key={item} label={AREA_LABELS[item]} selected={area === item} onPress={() => setArea(item)} />
              ))}
            </View>
            <KairosInput
              accessibilityHint="Write one action in your own words. It is saved as a private Kairos task."
              label="Your next step"
              maxLength={200}
              onChangeText={setTitle}
              placeholder={area === "work" ? "e.g. Draft the first page of the proposal" : area === "relationship" ? "e.g. Ask for a quiet time to talk this week" : "e.g. Take a short walk after lunch"}
              value={title}
            />
            <KairosInput label="A little context (optional)" maxLength={2000} multiline onChangeText={setDescription} value={description} />
            {dueDate ? <DateTimeField label="Due date" mode="date" value={dueDate} onChange={setDueDate} /> : <KairosButton compact label="Add an optional due date" icon="event" tone="secondary" onPress={() => setDueDate(new Date())} />}
            {dueDate ? <KairosButton compact label="Remove due date" tone="ghost" onPress={() => setDueDate(null)} /> : null}
            {user?.isPreview ? <Text style={[styles.notice, { color: colors.warning }]}>Preview only: saving is disabled because preview tasks are not stored in your account.</Text> : null}
            <Text style={[styles.notice, { color: colors.muted }]}>This planner saves the step you write as a private task. It does not send your goal, mood, sleep, journal, or assessment answers to an AI provider, and it never shares a task with a partner automatically.</Text>
            {error ? <Text accessibilityLiveRegion="assertive" style={[styles.error, { color: colors.error }]}>{error}</Text> : null}
            <KairosButton label="Save private next step" loading={createTask.isPending} disabled={user?.isPreview || !title.trim()} onPress={() => void save()} />
          </KairosCard>

          <KairosCard style={styles.card}>
            <Text accessibilityRole="header" style={[styles.heading, { color: colors.foreground }]}>Your last 7 days</Text>
            <Text style={[styles.body, { color: colors.muted }]}>A small check-in before you plan; these summaries stay on this screen.</Text>
            <View style={styles.statsRow}>
              <View style={[styles.stat, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.statLabel, { color: colors.muted }]}>Mood</Text>
                <Text style={[styles.statValue, { color: colors.foreground }]}>{moodsQuery.isError ? "Unavailable" : moodAverage === null ? "—" : `${moodAverage.toFixed(1)}/10`}</Text>
              </View>
              <View style={[styles.stat, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.statLabel, { color: colors.muted }]}>Sleep</Text>
                <Text style={[styles.statValue, { color: colors.foreground }]}>{sleepQuery.isError ? "Unavailable" : sleepAverage === null ? "—" : formatDuration(Math.round(sleepAverage))}</Text>
              </View>
            </View>
            <Text style={[styles.notice, { color: colors.muted }]}>These are descriptive averages of recorded check-ins only; they do not diagnose or recommend a clinical plan.</Text>
          </KairosCard>

          <View style={styles.listHeader}>
            <Text accessibilityRole="header" style={[styles.heading, { color: colors.foreground }]}>Open next steps</Text>
            <PressableScale accessibilityLabel="Open all tasks" accessibilityRole="button" onPress={() => router.push("/tasks")} style={styles.linkButton}>
              <Text style={[styles.linkText, { color: colors.primary }]}>All tasks</Text>
            </PressableScale>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {AREA_FILTERS.map((item) => <KairosChip key={item} label={item === "all" ? "All" : AREA_LABELS[item]} selected={filter === item} onPress={() => setFilter(item)} />)}
          </ScrollView>
          {tasksQuery.isLoading ? <StatePanel loading title="Loading your tasks" message="Getting your private next steps…" /> : null}
          {tasksQuery.isError ? <StatePanel title="Tasks unavailable" message={tasksQuery.error instanceof Error ? tasksQuery.error.message : "Try again shortly."} actionLabel="Retry" onAction={() => void tasksQuery.refetch()} /> : null}
          {!tasksQuery.isLoading && !tasksQuery.isError && openTasks.length === 0 ? (
            <KairosCard style={styles.emptyCard}>
              <Text style={[styles.body, { color: colors.muted }]}>No open steps in this view yet. Write one above or add it from Tasks.</Text>
            </KairosCard>
          ) : null}
          {openTasks.slice(0, 6).map((task) => (
            <PressableScale key={task.id} accessibilityLabel={`Edit ${task.title}`} accessibilityRole="button" onPress={() => router.push({ pathname: "/tasks/edit", params: { id: task.id } })}>
              <KairosCard style={styles.taskCard}>
                <View style={styles.taskCopy}>
                  <Text numberOfLines={2} style={[styles.taskTitle, { color: colors.foreground }]}>{task.title}</Text>
                  <Text style={[styles.taskMeta, { color: colors.muted }]}>{taskArea(task) ? AREA_LABELS[taskArea(task)!] : "General"} · {task.status.replace("_", " ")}{task.due_date ? ` · Due ${task.due_date}` : ""}</Text>
                </View>
                <MaterialIcons color={colors.muted} name="chevron-right" size={23} />
              </KairosCard>
            </PressableScale>
          ))}
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { gap: 16, padding: 16, paddingBottom: 36 },
  card: { gap: 14, padding: 18 },
  rowTitle: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconCircle: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  heading: { flex: 1, fontSize: 18, lineHeight: 24, fontFamily: Fonts.serif, fontWeight: "400" },
  body: { fontSize: 14, lineHeight: 20 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  notice: { fontSize: 12, lineHeight: 17 },
  error: { fontSize: 13, lineHeight: 18 },
  statsRow: { flexDirection: "row", gap: 10 },
  stat: { flex: 1, minHeight: 78, borderWidth: 1, borderRadius: 14, padding: 12, justifyContent: "space-between" },
  statLabel: { fontSize: 12, lineHeight: 16, fontWeight: "700" },
  statValue: { fontSize: 19, lineHeight: 25, fontWeight: "900" },
  listHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  linkButton: { minHeight: 40, justifyContent: "center", paddingHorizontal: 8 },
  linkText: { fontSize: 14, fontWeight: "800" },
  emptyCard: { padding: 18 },
  taskCard: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 14 },
  taskCopy: { flex: 1, gap: 5 },
  taskTitle: { fontSize: 15, lineHeight: 20, fontWeight: "800" },
  taskMeta: { fontSize: 12, lineHeight: 17, textTransform: "capitalize" },
});
