import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getWorkClient, TASK_COLUMNS } from "../lib/work/client";
import { useWorkSession } from "../lib/work/session";
import { workTaskSchema } from "../lib/work/validation";
import { newWorkId } from "../lib/work/id";
import { useWorkPreviewStore } from "../store/use-work-preview-store";
import { workKeys, type WorkTask, type WorkTaskInput } from "../types/work";
export function useWorkTasks() {
  const scope = useWorkSession();
  const preview = useWorkPreviewStore((s) => s.tasks);
  const query = useQuery({
    queryKey: workKeys.tasks(scope.user?.id ?? "anonymous"),
    meta: { sensitive: true },
    enabled: Boolean(scope.user && !scope.user.isPreview && !scope.loading),
    queryFn: async ({ signal }): Promise<WorkTask[]> => {
      const guard = scope.capture();
      await guard.cloud();
      const result = await getWorkClient()
        .from("work_tasks")
        .select(TASK_COLUMNS)
        .eq("user_id", guard.owner)
        .order("created_at", { ascending: false })
        .limit(300)
        .abortSignal(signal);
      guard.assert();
      if (result.error) throw result.error;
      return result.data ?? [];
    },
  });
  return {
    ...query,
    data: scope.user?.isPreview
      ? preview.filter((r) => r.user_id === scope.user?.id)
      : query.data,
  };
}
export function useSaveWorkTask() {
  const scope = useWorkSession(),
    cache = useQueryClient();
  return useMutation({
    meta: { sensitive: true },
    mutationFn: async ({
      id,
      input,
    }: {
      id?: string;
      input: WorkTaskInput;
    }) => {
      const guard = scope.capture(),
        values = workTaskSchema.parse(input);
      let record: WorkTask;
      if (guard.preview) {
        const existing = id
          ? useWorkPreviewStore
              .getState()
              .tasks.find((r) => r.id === id && r.user_id === guard.owner)
          : null;
        if (id && !existing) throw new Error("Work task not found.");
        const now = new Date().toISOString();
        record = {
          ...values,
          id: id ?? newWorkId(),
          user_id: guard.owner,
          created_at: existing?.created_at ?? now,
          updated_at: now,
        };
        guard.assert();
        useWorkPreviewStore.getState().saveTask(record);
      } else {
        await guard.cloud();
        const client = getWorkClient();
        const result = id
          ? await client
              .from("work_tasks")
              .update(values)
              .eq("id", id)
              .eq("user_id", guard.owner)
              .select(TASK_COLUMNS)
              .single()
          : await client
              .from("work_tasks")
              .insert({ ...values, user_id: guard.owner })
              .select(TASK_COLUMNS)
              .single();
        guard.assert();
        if (result.error) throw result.error;
        record = result.data;
      }
      return { record, guard };
    },
    onSuccess: async ({ guard }) => {
      if (guard.current() && !guard.preview)
        await cache.invalidateQueries({
          queryKey: workKeys.tasks(guard.owner),
        });
    },
  });
}
export function useDeleteWorkTask() {
  const scope = useWorkSession(),
    cache = useQueryClient();
  return useMutation({
    meta: { sensitive: true },
    mutationFn: async (id: string) => {
      const guard = scope.capture();
      if (guard.preview) {
        if (
          !useWorkPreviewStore
            .getState()
            .tasks.some((r) => r.id === id && r.user_id === guard.owner)
        )
          throw new Error("Work task not found.");
        useWorkPreviewStore.getState().deleteTask(id);
      } else {
        await guard.cloud();
        const result = await getWorkClient()
          .from("work_tasks")
          .delete()
          .eq("id", id)
          .eq("user_id", guard.owner)
          .select("id")
          .single();
        guard.assert();
        if (result.error) throw result.error;
      }
      return guard;
    },
    onSuccess: async (guard) => {
      if (guard.current() && !guard.preview)
        await Promise.all([
          cache.invalidateQueries({ queryKey: workKeys.tasks(guard.owner) }),
          cache.invalidateQueries({ queryKey: workKeys.events(guard.owner) }),
          cache.invalidateQueries({ queryKey: workKeys.files(guard.owner) }),
        ]);
    },
  });
}
