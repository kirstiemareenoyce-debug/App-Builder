import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getWorkClient, EVENT_COLUMNS } from "../lib/work/client";
import { useWorkSession } from "../lib/work/session";
import { validateWorkEvent } from "../lib/work/validation";
import { zonedWorkISO, workMonthBounds } from "../lib/work/calendar";
import { newWorkId } from "../lib/work/id";
import { useWorkPreviewStore } from "../store/use-work-preview-store";
import { workKeys, type WorkEvent, type WorkEventInput } from "../types/work";
export function useWorkCalendar(month: string, timezone: string) {
  const scope = useWorkSession(),
    preview = useWorkPreviewStore((s) => s.events);
  const { first, next, lower, upper } = workMonthBounds(month);
  const query = useQuery({
    queryKey: [
      ...workKeys.events(scope.user?.id ?? "anonymous"),
      month,
      timezone,
    ],
    meta: { sensitive: true },
    enabled: Boolean(scope.user && !scope.user.isPreview && !scope.loading),
    queryFn: async ({ signal }): Promise<WorkEvent[]> => {
      const guard = scope.capture();
      await guard.cloud();
      const result = await getWorkClient()
        .from("work_events")
        .select(EVENT_COLUMNS)
        .eq("user_id", guard.owner)
        .or(
          `and(all_day.eq.true,start_date.lt.${next},end_date.gt.${first}),and(all_day.eq.false,starts_at.lt.${upper},ends_at.gt.${lower})`,
        )
        .order("created_at", { ascending: false })
        .limit(500)
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
export function useSaveWorkEvent() {
  const scope = useWorkSession(),
    cache = useQueryClient();
  return useMutation({
    meta: { sensitive: true },
    mutationFn: async ({
      id,
      input,
    }: {
      id?: string;
      input: WorkEventInput;
    }) => {
      const guard = scope.capture();
      // Existing stored instants are UTC; convert back to zone-offset form for the same strict validator.
      const values = validateWorkEvent(input);
      let record: WorkEvent;
      if (guard.preview) {
        const store = useWorkPreviewStore.getState();
        if (
          values.task_id &&
          !store.tasks.some(
            (t) => t.id === values.task_id && t.user_id === guard.owner,
          )
        )
          throw new Error("Linked task must belong to this Work account.");
        const existing = id
          ? store.events.find((r) => r.id === id && r.user_id === guard.owner)
          : null;
        if (id && !existing) throw new Error("Work event not found.");
        const now = new Date().toISOString();
        record = {
          ...values,
          id: id ?? newWorkId(),
          user_id: guard.owner,
          created_at: existing?.created_at ?? now,
          updated_at: now,
        };
        guard.assert();
        store.saveEvent(record);
      } else {
        await guard.cloud();
        const client = getWorkClient();
        const result = id
          ? await client
              .from("work_events")
              .update(values)
              .eq("id", id)
              .eq("user_id", guard.owner)
              .select(EVENT_COLUMNS)
              .single()
          : await client
              .from("work_events")
              .insert({ ...values, user_id: guard.owner })
              .select(EVENT_COLUMNS)
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
          queryKey: workKeys.events(guard.owner),
        });
    },
  });
}
export function useDeleteWorkEvent() {
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
            .events.some((r) => r.id === id && r.user_id === guard.owner)
        )
          throw new Error("Work event not found.");
        useWorkPreviewStore.getState().deleteEvent(id);
      } else {
        await guard.cloud();
        const result = await getWorkClient()
          .from("work_events")
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
          cache.invalidateQueries({ queryKey: workKeys.events(guard.owner) }),
          cache.invalidateQueries({ queryKey: workKeys.files(guard.owner) }),
        ]);
    },
  });
}
export function workEventForEditor(event: WorkEvent): WorkEventInput {
  return {
    title: event.title,
    notes: event.notes,
    location: event.location,
    job_label: event.job_label,
    task_id: event.task_id,
    all_day: event.all_day,
    start_date: event.start_date,
    end_date: event.end_date,
    timezone: event.timezone,
    starts_at: event.starts_at
      ? zonedWorkISO(new Date(event.starts_at), event.timezone)
      : null,
    ends_at: event.ends_at
      ? zonedWorkISO(new Date(event.ends_at), event.timezone)
      : null,
  };
}
