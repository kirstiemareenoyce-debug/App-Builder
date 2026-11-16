import type { SupabaseClient } from "@supabase/supabase-js";
import type { QueryClient } from "@tanstack/react-query";
import type { KairosAIDatabase } from "../types/kairos-ai";

export const KAIROS_AI_ALLOWANCE_MAX_AGE = 30_000;
export const kairosAIAllowanceKey = (owner: string) => ["kairos-ai-allowance", owner] as const;
export type KairosAIAllowance = {
  owner: string; used: number; dailyLimit: number; resetsAt: string;
  observedAt: number; requestedAt: number;
};
const unavailable = () => new Error("Daily AI allowance is unavailable. Check your connection or ask for the reviewed status setup. Sending is still checked by the server.");

export function parseKairosAIAllowance(data: unknown, owner: string, requestedAt: number): KairosAIAllowance {
  const row = Array.isArray(data) && data.length === 1 ? data[0] : null;
  if (!row || !Number.isInteger(row.used) || !Number.isInteger(row.daily_limit) ||
    row.used < 0 || row.daily_limit < 1 || row.used > row.daily_limit ||
    typeof row.resets_at !== "string" || typeof row.observed_at !== "string") throw unavailable();
  const reset = Date.parse(row.resets_at);
  const observed = Date.parse(row.observed_at);
  if (!Number.isFinite(reset) || !Number.isFinite(observed) || reset <= observed ||
    reset - observed > 86_400_000 || new Date(reset).toISOString().slice(11) !== "00:00:00.000Z") throw unavailable();
  return { owner, used: row.used, dailyLimit: row.daily_limit,
    resetsAt: new Date(reset).toISOString(), observedAt: observed, requestedAt };
}

/** Token pinned to the initiating owner, just like private history deletion. */
export async function fetchKairosAIAllowance(
  client: SupabaseClient<KairosAIDatabase>, expectedOwner: string, signal?: AbortSignal,
): Promise<KairosAIAllowance> {
  const { data, error } = await client.auth.getSession();
  if (error || !expectedOwner || !data.session || data.session.user.id !== expectedOwner) {
    throw new Error("Your account changed or your session expired. Sign in to check your allowance.");
  }
  const requestedAt = Date.now();
  const request = client.rpc("kairos_ai_allowance_status", {}, { get: true })
    .setHeader("Authorization", `Bearer ${data.session.access_token}`);
  const result = await (signal ? request.abortSignal(signal) : request);
  if (result.error) throw unavailable();
  return parseKairosAIAllowance(result.data, expectedOwner, requestedAt);
}

/** Conservative age includes network time; use server day, not device timezone. */
export function kairosAIAllowanceFreshFor(data: KairosAIAllowance, now: number): number {
  const age = now - data.requestedAt;
  if (age < 0) return 0; // Device clock changed; never relabel an old day.
  return Math.max(0, Math.min(KAIROS_AI_ALLOWANCE_MAX_AGE, Date.parse(data.resetsAt) - data.observedAt) - age);
}

export function kairosAIAllowanceText(data: KairosAIAllowance | undefined, owner: string | null,
  now: number, invalid: boolean): string {
  if (!data || data.owner !== owner || invalid || !kairosAIAllowanceFreshFor(data, now)) {
    return "Daily AI allowance is not current. Refresh to check; sending is still checked by the server.";
  }
  return `${data.dailyLimit - data.used} of ${data.dailyLimit} daily AI requests remaining for your account. Resets ${data.resetsAt.slice(0, 10)} at 00:00 UTC.`;
}

/** An earlier in-flight snapshot must not overwrite the post-attempt read. */
export function refreshKairosAIAllowance(queryClient: QueryClient, owner: string): Promise<void> {
  const queryKey = kairosAIAllowanceKey(owner);
  const cancelled = queryClient.cancelQueries({ queryKey, exact: true });
  // Mark unknown synchronously, before an AI mutation can finish rendering.
  // Cancellation happens first so its state rollback cannot undo invalidation.
  void queryClient.invalidateQueries({ queryKey, exact: true, refetchType: "none" }).catch(() => undefined);
  return cancelled.then(() => queryClient.invalidateQueries({ queryKey, exact: true }));
}

/** Read-only status must never delay delivery of a generated reply or error. */
export function refreshKairosAIAllowanceAfterAttempt(queryClient: QueryClient, owner: string): void {
  void refreshKairosAIAllowance(queryClient, owner).catch(() => undefined);
}
