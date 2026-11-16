import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { memo, useMemo, useState } from "react";
import { Alert, FlatList, Platform, StyleSheet, Text, View } from "react-native";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";

import { KairosBadge } from "@/components/kairos/badge";
import { KairosCard } from "@/components/kairos/card";
import { KairosChip } from "@/components/kairos/chip";
import { PressableScale } from "@/components/kairos/pressable-scale";
import { ScreenHeader } from "@/components/kairos/screen-header";
import { StatePanel } from "@/components/kairos/state-panel";
import { ScreenContainer } from "@/components/screen-container";
import { useDeleteTask, useTasks, useUpdateTask } from "@/hooks/use-tasks";
import { useColors } from "@/hooks/use-colors";
import { formatShortDate } from "@/lib/date";
import { useKairosUI } from "@/providers/kairos-ui-provider";
import type { Task, TaskFilter } from "@/types/app";

const FILTERS: { value: TaskFilter; label: string }[] = [
  { value: "todo", label: "To Do" },
  { value: "in_progress", label: "In Progress" },
  { value: "done", label: "Done" },
  { value: "all", label: "All" },
];

const PRIORITY_TONE = { low: "success", medium: "warning", high: "error", urgent: "error" } as const;

const TaskRow = memo(function TaskRow({ task, onComplete, onDelete, onEdit }: {
  task: Task;
  onComplete: (task: Task) => void;
  onDelete: (task: Task) => void;
  onEdit: (task: Task) => void;
}) {
  const colors = useColors();
  const completeAction = (
    <PressableScale accessibilityLabel={`Complete ${task.title}`} haptic="medium" onPress={() => onComplete(task)} style={[styles.swipeAction, styles.completeAction, { backgroundColor: colors.primary }]}>
      <MaterialIcons color="#FFFFFF" name="check" size={25} />
      <Text style={styles.swipeLabel}>Complete</Text>
    </PressableScale>
  );
  const deleteAction = (
    <PressableScale accessibilityLabel={`Delete ${task.title}`} haptic="medium" onPress={() => onDelete(task)} style={[styles.swipeAction, styles.deleteAction, { backgroundColor: colors.error }]}>
      <MaterialIcons color="#FFFFFF" name="delete" size={24} />
      <Text style={styles.swipeLabel}>Delete</Text>
    </PressableScale>
  );

  return (
    <ReanimatedSwipeable friction={2} leftThreshold={45} rightThreshold={45} renderLeftActions={() => completeAction} renderRightActions={() => deleteAction}>
      <PressableScale accessibilityLabel={`${task.title}, ${task.status.replace("_", " ")}`} haptic="none" onPress={() => onEdit(task)}>
        <KairosCard style={styles.taskCard}>
          <PressableScale accessibilityLabel={task.status === "done" ? `Mark ${task.title} not done` : `Mark ${task.title} complete`} haptic="medium" onPress={() => onComplete(task)} style={[styles.checkbox, { borderColor: task.status === "done" ? colors.primary : colors.border, backgroundColor: task.status === "done" ? colors.primary : "transparent" }]}>
            {task.status === "done" ? <MaterialIcons color="#FFFFFF" name="check" size={18} /> : null}
          </PressableScale>
          <View style={styles.taskCopy}>
            <View style={styles.taskTopLine}>
              <Text numberOfLines={2} style={[styles.taskTitle, { color: colors.foreground }, task.status === "done" && styles.completedTitle]}>{task.title}</Text>
              <KairosBadge label={task.priority} tone={PRIORITY_TONE[task.priority]} />
            </View>
            <View style={styles.taskMeta}>
              <Text style={[styles.taskStatus, { color: colors.muted }]}>{task.status.replace("_", " ")}</Text>
              {task.due_date ? <Text style={[styles.taskDate, { color: colors.muted }]}>Due {formatShortDate(task.due_date)}</Text> : null}
            </View>
          </View>
        </KairosCard>
      </PressableScale>
    </ReanimatedSwipeable>
  );
});

export default function TaskListScreen() {
  const colors = useColors();
  const router = useRouter();
  const { showToast } = useKairosUI();
  const tasks = useTasks();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const [filter, setFilter] = useState<TaskFilter>("todo");
  const filtered = useMemo(() => (tasks.data ?? []).filter((task) => filter === "all" || task.status === filter), [filter, tasks.data]);

  const complete = async (task: Task) => {
    const done = task.status !== "done";
    try {
      await updateTask.mutateAsync({
        id: task.id,
        updates: { status: done ? "done" : "todo", completed_at: done ? new Date().toISOString() : null },
      });
      if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      showToast(done ? "Task completed." : "Task returned to To Do.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Task could not be updated.", "error");
    }
  };

  const remove = (task: Task) => {
    const confirm = async () => {
      try {
        await deleteTask.mutateAsync(task.id);
        showToast("Task deleted.", "success");
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Task could not be deleted.", "error");
      }
    };
    if (Platform.OS === "web") {
      if (globalThis.confirm?.(`Delete “${task.title}”?`)) void confirm();
      return;
    }
    Alert.alert("Delete task?", `“${task.title}” will be removed permanently.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void confirm() },
    ]);
  };

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <View style={styles.headerWrap}>
        <ScreenHeader showBack title="Tasks" subtitle="Move what matters forward" />
        <FlatList
          horizontal
          data={FILTERS}
          keyExtractor={(item) => item.value}
          contentContainerStyle={styles.filters}
          showsHorizontalScrollIndicator={false}
          renderItem={({ item }) => <KairosChip label={item.label} selected={filter === item.value} onPress={() => setFilter(item.value)} />}
        />
      </View>
      <FlatList
        data={filtered}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={7}
        keyExtractor={(item) => item.id}
        contentContainerStyle={filtered.length === 0 ? styles.emptyList : styles.list}
        ListEmptyComponent={<StatePanel loading={tasks.isLoading} icon={tasks.isError ? "error-outline" : "task-alt"} title={tasks.isLoading ? "Loading tasks" : tasks.isError ? "Tasks unavailable" : "No tasks in this view"} message={tasks.isError ? (tasks.error instanceof Error ? tasks.error.message : "Try again shortly.") : "Create a task or choose another filter."} actionLabel={tasks.isError ? "Try again" : "Add task"} onAction={tasks.isError ? () => void tasks.refetch() : () => router.push("/tasks/edit")} />}
        renderItem={({ item }) => <TaskRow task={item} onComplete={(task) => void complete(task)} onDelete={remove} onEdit={(task) => router.push({ pathname: "/tasks/edit", params: { id: task.id } })} />}
      />
      <PressableScale accessibilityLabel="Add task" onPress={() => router.push("/tasks/edit")} style={[styles.fab, { backgroundColor: colors.primary }]}>
        <MaterialIcons color="#FFFFFF" name="add" size={30} />
      </PressableScale>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  headerWrap: { gap: 12, paddingHorizontal: 20, paddingTop: 10 },
  filters: { gap: 8, paddingRight: 20 },
  list: { gap: 10, padding: 20, paddingBottom: 108 },
  emptyList: { flexGrow: 1, paddingBottom: 100 },
  taskCard: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 0 },
  checkbox: { width: 38, height: 38, borderRadius: 19, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  taskCopy: { flex: 1, gap: 8 },
  taskTopLine: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  taskTitle: { flex: 1, fontSize: 16, lineHeight: 22, fontWeight: "700" },
  completedTitle: { textDecorationLine: "line-through", opacity: 0.65 },
  taskMeta: { flexDirection: "row", alignItems: "center", gap: 12 },
  taskStatus: { fontSize: 12, lineHeight: 17, textTransform: "capitalize" },
  taskDate: { fontSize: 12, lineHeight: 17 },
  swipeAction: { width: 104, justifyContent: "center", alignItems: "center", gap: 5 },
  completeAction: { borderTopLeftRadius: 16, borderBottomLeftRadius: 16 },
  deleteAction: { borderTopRightRadius: 16, borderBottomRightRadius: 16 },
  swipeLabel: { color: "#FFFFFF", fontSize: 12, lineHeight: 16, fontWeight: "700" },
  fab: { position: "absolute", right: 22, bottom: 22, width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center", shadowColor: "#000000", shadowOpacity: 0.28, shadowRadius: 12, shadowOffset: { width: 0, height: 7 }, elevation: 7 },
});
