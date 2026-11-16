import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { KairosButton } from "@/components/kairos/button";
import { KairosCard } from "@/components/kairos/card";
import { KairosChip } from "@/components/kairos/chip";
import { DateTimeField } from "@/components/kairos/date-time-field";
import { KairosInput } from "@/components/kairos/input";
import { ScreenHeader } from "@/components/kairos/screen-header";
import { StatePanel } from "@/components/kairos/state-panel";
import { ScreenContainer } from "@/components/screen-container";
import { useCreateTask, useTasks, useUpdateTask } from "@/hooks/use-tasks";
import { useColors } from "@/hooks/use-colors";
import { useKairosUI } from "@/providers/kairos-ui-provider";
import { parseCommaTags, taskEntrySchema, taskPriorities, taskStatuses } from "@/lib/frontend-validation";
import { formatTaskDueDate, parseTaskDueDate } from "@/lib/task-date";

export default function TaskEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const colors = useColors();
  const { showToast } = useKairosUI();
  const tasks = useTasks();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const existing = useMemo(() => tasks.data?.find((task) => task.id === id), [id, tasks.data]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<(typeof taskPriorities)[number]>("medium");
  const [status, setStatus] = useState<(typeof taskStatuses)[number]>("todo");
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [tagsText, setTagsText] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!existing) return;
    setTitle(existing.title);
    setDescription(existing.description ?? "");
    setPriority(existing.priority);
    setStatus(existing.status);
    setDueDate(parseTaskDueDate(existing.due_date));
    setTagsText(existing.tags.join(", "));
  }, [existing]);

  if (id && tasks.isLoading) {
    return <ScreenContainer edges={["top", "bottom", "left", "right"]}><StatePanel loading title="Loading task" message="Preparing the editor…" /></ScreenContainer>;
  }

  if (id && (tasks.isError || !existing)) {
    return (
      <ScreenContainer edges={["top", "bottom", "left", "right"]}>
        <StatePanel
          icon={tasks.isError ? "error-outline" : "search-off"}
          title={tasks.isError ? "Task unavailable" : "Task not found"}
          message={tasks.isError && tasks.error instanceof Error ? tasks.error.message : "This task may have been removed or is no longer accessible."}
          actionLabel="Go back"
          onAction={() => router.back()}
        />
      </ScreenContainer>
    );
  }

  const save = async () => {
    const parsed = taskEntrySchema.safeParse({ title, description, priority, status, dueDate, tags: parseCommaTags(tagsText) });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the task fields.");
      return;
    }
    try {
      setError(null);
      const payload = {
        title: parsed.data.title,
        description: parsed.data.description || null,
        priority: parsed.data.priority,
        status: parsed.data.status,
        due_date: formatTaskDueDate(parsed.data.dueDate),
        tags: parsed.data.tags,
        completed_at: parsed.data.status === "done" ? existing?.completed_at ?? new Date().toISOString() : null,
      };
      if (existing) await updateTask.mutateAsync({ id: existing.id, updates: payload });
      else await createTask.mutateAsync(payload);
      showToast(existing ? "Task updated." : "Task created.", "success");
      router.back();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Task could not be saved.");
    }
  };

  const saving = createTask.isPending || updateTask.isPending;
  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ScreenHeader showBack title={existing ? "Edit task" : "New task"} subtitle="Clear, specific, achievable" />
        <KairosCard style={styles.form}>
          <KairosInput label="Title" maxLength={200} onChangeText={setTitle} value={title} />
          <KairosInput label="Description (optional)" multiline maxLength={2000} onChangeText={setDescription} value={description} />
          <Text style={[styles.sectionLabel, { color: colors.foreground }]}>Priority</Text>
          <View style={styles.chips}>
            {taskPriorities.map((value) => <KairosChip key={value} label={value[0].toUpperCase() + value.slice(1)} selected={priority === value} onPress={() => setPriority(value)} />)}
          </View>
          <Text style={[styles.sectionLabel, { color: colors.foreground }]}>Status</Text>
          <View style={styles.chips}>
            {taskStatuses.map((value) => <KairosChip key={value} label={value.replace("_", " ").replace(/^./, (character) => character.toUpperCase())} selected={status === value} onPress={() => setStatus(value)} />)}
          </View>
          {dueDate ? <DateTimeField label="Due date" mode="date" value={dueDate} onChange={setDueDate} /> : <KairosButton compact label="Add due date" icon="event" tone="secondary" onPress={() => setDueDate(new Date())} />}
          {dueDate ? <KairosButton compact label="Remove due date" tone="ghost" onPress={() => setDueDate(null)} /> : null}
          <KairosInput label="Tags" helperText="Comma-separated, up to 10" maxLength={410} onChangeText={setTagsText} value={tagsText} />
          {error ? <Text accessibilityLiveRegion="assertive" style={[styles.error, { color: colors.error }]}>{error}</Text> : null}
          <KairosButton label="Save Task" loading={saving} onPress={() => void save()} />
          <KairosButton label="Cancel" tone="ghost" disabled={saving} onPress={() => router.back()} />
        </KairosCard>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { gap: 18, padding: 20, paddingBottom: 36 },
  form: { gap: 16 },
  sectionLabel: { fontSize: 14, lineHeight: 19, fontWeight: "700" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  error: { fontSize: 13, lineHeight: 18 },
});
