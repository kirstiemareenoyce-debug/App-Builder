import type { QueryClient } from "@tanstack/react-query";
import { kairosAIHistoryKey, type KairosAIHistoryDeletion } from "./kairos-ai-history";
import type { KairosAIInteraction } from "../types/kairos-ai";

// Holds no message content or credentials. Unlike the mutation cache, this lock
// survives screen unmounts and auth-cache clearing (including A -> B -> A).
const activeOwners = new Set<string>();
const listeners = new Set<() => void>();
export const subscribeKairosAIOperations = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export const isKairosAIBusy = (owner: string | null) => Boolean(owner && activeOwners.has(owner));
function notify() { listeners.forEach((listener) => listener()); }
export async function runKairosAIOperation<T>(owner: string, operation: () => Promise<T>): Promise<T> {
  if (activeOwners.has(owner)) throw new Error("Wait for the current Kairos request or deletion to finish.");
  activeOwners.add(owner);
  notify();
  try { return await operation(); }
  finally { activeOwners.delete(owner); notify(); }
}

export async function deleteKairosAIHistoryAndRefresh(
  queryClient: QueryClient, owner: string, target: KairosAIHistoryDeletion,
  remove: () => Promise<void>,
): Promise<void> {
  const queryKey = kairosAIHistoryKey(owner);
  // Cancel both pre-delete reads and reads started while DELETE was running.
  // The query consumes AbortSignal, so a late snapshot cannot repopulate it.
  await queryClient.cancelQueries({ queryKey, exact: true });
  await remove();
  await queryClient.cancelQueries({ queryKey, exact: true });
  // Undefined remains undefined: don't recreate an old account's cleared cache.
  queryClient.setQueryData<KairosAIInteraction[]>(queryKey, (rows) =>
    rows?.filter((row) => target.kind === "pair" && row.id !== target.interactionId));
  // Refetch older rows after deleting from the latest-50 window. A failed
  // refresh is a load error, not evidence that DELETE failed.
  void queryClient.invalidateQueries({ queryKey, exact: true }).catch(() => undefined);
}
