import { useState } from "react";
import { View } from "react-native";
import { KairosButton } from "../../../../components/kairos/button";
import { KairosCard } from "../../../../components/kairos/card";
import {
  useWorkTasks,
  useSaveWorkTask,
  useDeleteWorkTask,
} from "../../../../hooks/use-work-tasks";
import { useWorkSession } from "../../../../lib/work/session";
import { workError } from "../../../../lib/work/validation";
import {
  WorkPage,
  WorkText,
  WorkField,
  ConfirmWorkDelete,
  workStyles,
} from "../../../../lib/work/ui";
import type { WorkTaskInput } from "../../../../types/work";
const empty = (): WorkTaskInput => ({
  title: "",
  notes: "",
  job_label: "",
  due_date: null,
  status: "todo",
});
export default function WorkTasksScreen() {
  const scope = useWorkSession();
  return <Tasks key={scope.identity} />;
}
function Tasks() {
  const scope = useWorkSession(),
    query = useWorkTasks(),
    save = useSaveWorkTask(),
    remove = useDeleteWorkTask();
  const [form, setForm] = useState(empty),
    [editing, setEditing] = useState<string | undefined>(),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const change = <K extends keyof WorkTaskInput>(
    key: K,
    value: WorkTaskInput[K],
  ) => setForm((f) => ({ ...f, [key]: value }));
  const clear = () => {
    setEditing(undefined);
    setForm(empty());
  };
  const submit = async () => {
    const guard = scope.capture();
    setError("");
    try {
      await save.mutateAsync({ id: editing, input: form });
      guard.assert();
      clear();
      setNotice(
        guard.preview
          ? "Task saved in this preview session only."
          : "Work task saved privately.",
      );
    } catch (e) {
      if (guard.current()) setError(workError(e));
    }
  };
  const deleteTask = async (id: string) => {
    const guard = scope.capture();
    try {
      await remove.mutateAsync(id);
      guard.assert();
      if (editing === id) clear();
      setNotice("Work task removed.");
    } catch (e) {
      if (guard.current()) setError(workError(e));
    }
  };
  return (
    <WorkPage
      title="Work tasks"
      subtitle="Your next steps — not your personal task list."
    >
      <KairosCard style={workStyles.card}>
        <WorkText title>
          {editing ? "Edit Work task" : "Add Work task"}
        </WorkText>
        <WorkField
          label="Task title"
          value={form.title}
          onChange={(v) => change("title", v)}
        />
        <WorkField
          label="Job label (optional)"
          value={form.job_label}
          maxLength={120}
          onChange={(v) => change("job_label", v)}
        />
        <WorkField
          label="Due date (optional, YYYY-MM-DD)"
          value={form.due_date ?? ""}
          maxLength={10}
          onChange={(v) => change("due_date", v || null)}
        />
        <WorkField
          label="Notes (optional)"
          value={form.notes}
          maxLength={2000}
          multiline
          onChange={(v) => change("notes", v)}
        />
        <View style={workStyles.row}>
          {(["todo", "in_progress", "done"] as const).map((status) => (
            <KairosButton
              key={status}
              compact
              tone={form.status === status ? "primary" : "secondary"}
              label={status.replace("_", " ")}
              onPress={() => change("status", status)}
            />
          ))}
        </View>
        {error ? <WorkText error>{error}</WorkText> : null}
        <KairosButton
          label={editing ? "Save changes" : "Add task"}
          icon="save"
          loading={save.isPending}
          disabled={!scope.user || scope.loading}
          onPress={() => void submit()}
        />
        {editing ? (
          <KairosButton label="Cancel editing" tone="ghost" onPress={clear} />
        ) : null}
      </KairosCard>
      {notice ? <WorkText>{notice}</WorkText> : null}
      <WorkText title>Your Work list</WorkText>
      {!scope.user?.isPreview && query.isLoading ? (
        <WorkText>Loading private Work tasks…</WorkText>
      ) : null}
      {!scope.user?.isPreview && query.error ? (
        <>
          <WorkText error>{workError(query.error)}</WorkText>
          <KairosButton
            label="Retry loading"
            tone="secondary"
            onPress={() => void query.refetch()}
          />
        </>
      ) : null}
      {(query.data ?? []).map((task) => (
        <KairosCard key={task.id} style={workStyles.card}>
          <WorkText title>{task.title}</WorkText>
          <WorkText>
            {task.status.replace("_", " ")}
            {task.due_date ? ` · due ${task.due_date}` : ""}
            {task.job_label ? ` · ${task.job_label}` : ""}
          </WorkText>
          {task.notes ? <WorkText>{task.notes}</WorkText> : null}
          <View style={workStyles.row}>
            <KairosButton
              compact
              tone="secondary"
              label="View / edit"
              onPress={() => {
                setEditing(task.id);
                setForm({
                  title: task.title,
                  notes: task.notes,
                  job_label: task.job_label,
                  due_date: task.due_date,
                  status: task.status,
                });
                setError("");
              }}
            />
            <ConfirmWorkDelete
              label="Remove task"
              description="Remove this Work task permanently? Linked Work file/event references will be cleared, not the files/events themselves."
              disabled={remove.isPending}
              onConfirm={() => void deleteTask(task.id)}
            />
          </View>
        </KairosCard>
      ))}
      {!query.data?.length && (!query.isLoading || scope.user?.isPreview) ? (
        <WorkText>No Work tasks yet. Add your own task above.</WorkText>
      ) : null}
      <WorkText>Showing up to 300 most recent cloud tasks.</WorkText>
    </WorkPage>
  );
}
