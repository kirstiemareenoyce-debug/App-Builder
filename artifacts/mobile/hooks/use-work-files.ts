import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  getWorkClient,
  FILE_COLUMNS,
  EVENT_COLUMNS,
  TASK_COLUMNS,
} from "../lib/work/client";
import { useWorkSession, type WorkGuard } from "../lib/work/session";
import { workFileSchema } from "../lib/work/validation";
import {
  WORK_FILE_BUCKET,
  isOwnedWorkPath,
  workObjectPath,
} from "../lib/work/files";
import { readSelectedWorkFile } from "../lib/work/file-input";
import { newWorkId } from "../lib/work/id";
import { useWorkPreviewStore } from "../store/use-work-preview-store";
import { runWorkUpload } from "../lib/work/upload";
import {
  workKeys,
  type WorkFile,
  type WorkFileInput,
  type SelectedWorkFile,
} from "../types/work";
export function useWorkFiles() {
  const scope = useWorkSession(),
    preview = useWorkPreviewStore((s) => s.files);
  const query = useQuery({
    queryKey: workKeys.files(scope.user?.id ?? "anonymous"),
    meta: { sensitive: true },
    enabled: Boolean(scope.user && !scope.user.isPreview && !scope.loading),
    queryFn: async ({ signal }): Promise<WorkFile[]> => {
      const guard = scope.capture();
      await guard.cloud();
      const result = await getWorkClient()
        .from("work_files")
        .select(FILE_COLUMNS)
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
async function checkReferences(input: WorkFileInput, guard: WorkGuard) {
  const store = useWorkPreviewStore.getState();
  if (guard.preview) {
    if (
      input.task_id &&
      !store.tasks.some(
        (t) => t.id === input.task_id && t.user_id === guard.owner,
      )
    )
      throw new Error("Linked Work task is not owned by this account.");
    if (
      input.event_id &&
      !store.events.some(
        (e) => e.id === input.event_id && e.user_id === guard.owner,
      )
    )
      throw new Error("Linked Work event is not owned by this account.");
    return;
  }
  const client = getWorkClient();
  if (input.task_id) {
    await guard.cloud();
    const result = await client
      .from("work_tasks")
      .select(TASK_COLUMNS)
      .eq("id", input.task_id)
      .eq("user_id", guard.owner)
      .single();
    guard.assert();
    if (result.error)
      throw new Error("Choose a Work task owned by this account.");
  }
  if (input.event_id) {
    await guard.cloud();
    const result = await client
      .from("work_events")
      .select(EVENT_COLUMNS)
      .eq("id", input.event_id)
      .eq("user_id", guard.owner)
      .single();
    guard.assert();
    if (result.error)
      throw new Error("Choose a Work event owned by this account.");
  }
}
export function useUploadWorkFile() {
  const scope = useWorkSession(),
    cache = useQueryClient();
  return useMutation({
    meta: { sensitive: true },
    mutationFn: async ({
      selected,
      input,
    }: {
      selected: SelectedWorkFile;
      input: WorkFileInput;
    }) => {
      const guard = scope.capture(),
        values = workFileSchema.parse(input);
      await checkReferences(values, guard);
      guard.assert();
      const { bytes, mime } = await readSelectedWorkFile(selected);
      guard.assert();
      const id = newWorkId(),
        path = workObjectPath(guard.owner, id, mime);
      const original_name = selected.name.slice(0, 255);
      if (!original_name.trim())
        throw new Error("The selected file needs a name.");
      const metadata = {
        ...values,
        user_id: guard.owner,
        object_path: path,
        original_name,
        mime_type: mime,
        size_bytes: bytes.byteLength,
      };
      if (guard.preview) {
        useWorkPreviewStore
          .getState()
          .saveFile({
            ...metadata,
            id,
            created_at: new Date().toISOString(),
            preview_uri: selected.uri,
          });
        return { guard };
      }
      const client = getWorkClient();
      await runWorkUpload({
        guard,
        upload: async () => {
          const result = await client.storage
            .from(WORK_FILE_BUCKET)
            .upload(path, bytes.buffer as ArrayBuffer, {
              contentType: mime,
              upsert: false,
            });
          if (result.error) throw result.error;
        },
        insert: async () => {
          const result = await client
            .from("work_files")
            .insert(metadata)
            .select(FILE_COLUMNS)
            .single();
          if (result.error) throw result.error;
        },
        cleanup: async () => {
          const result = await client.storage
            .from(WORK_FILE_BUCKET)
            .remove([path]);
          if (result.error) throw result.error;
        },
      });
      return { guard };
    },
    onSuccess: async ({ guard }) => {
      if (guard.current() && !guard.preview)
        await cache.invalidateQueries({
          queryKey: workKeys.files(guard.owner),
        });
    },
  });
}
/** Signed URLs are generated on demand, not stored in query results or persisted caches. */
export function useOpenWorkFile() {
  const scope = useWorkSession();
  const [isPending, setPending] = useState(false);
  return {
    isPending,
    open: async (id: string) => {
      const guard = scope.capture();
      setPending(true);
      try {
        if (guard.preview) {
          const file = useWorkPreviewStore
            .getState()
            .files.find((f) => f.id === id && f.user_id === guard.owner);
          if (!file) throw new Error("Preview file not found.");
          return { url: file.preview_uri, file, guard };
        }
        await guard.cloud();
        const client = getWorkClient();
        const result = await client
          .from("work_files")
          .select(FILE_COLUMNS)
          .eq("id", id)
          .eq("user_id", guard.owner)
          .single();
        guard.assert();
        if (result.error) throw result.error;
        if (!isOwnedWorkPath(result.data.object_path, guard.owner))
          throw new Error("Invalid Work file ownership.");
        await guard.cloud();
        const signed = await client.storage
          .from(WORK_FILE_BUCKET)
          .createSignedUrl(result.data.object_path, 60);
        guard.assert();
        if (signed.error) throw signed.error;
        return { url: signed.data.signedUrl, file: result.data, guard };
      } finally {
        if (guard.current()) setPending(false);
      }
    },
  };
}
export function useDeleteWorkFile() {
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
            .files.some((r) => r.id === id && r.user_id === guard.owner)
        )
          throw new Error("Preview file not found.");
        useWorkPreviewStore.getState().deleteFile(id);
        return { guard, cleanupPending: false };
      }
      await guard.cloud();
      const client = getWorkClient();
      const found = await client
        .from("work_files")
        .select(FILE_COLUMNS)
        .eq("id", id)
        .eq("user_id", guard.owner)
        .single();
      guard.assert();
      if (found.error) throw found.error;
      if (!isOwnedWorkPath(found.data.object_path, guard.owner))
        throw new Error("Invalid Work file ownership.");
      // Keep the metadata available for retry if object deletion fails; delete row only after storage succeeds.
      await guard.cloud();
      const removed = await client.storage
        .from(WORK_FILE_BUCKET)
        .remove([found.data.object_path]);
      guard.assert();
      if (removed.error)
        throw new Error(
          "File deletion failed. Its metadata is retained so you can retry.",
        );
      await guard.cloud();
      const result = await client
        .from("work_files")
        .delete()
        .eq("id", id)
        .eq("user_id", guard.owner)
        .select("id")
        .single();
      guard.assert();
      if (result.error)
        throw new Error(
          "File removed from storage; metadata cleanup failed. Retry Remove to finish.",
        );
      return { guard, cleanupPending: false };
    },
    onSuccess: async ({ guard }) => {
      if (guard.current() && !guard.preview)
        await cache.invalidateQueries({
          queryKey: workKeys.files(guard.owner),
        });
    },
  });
}
