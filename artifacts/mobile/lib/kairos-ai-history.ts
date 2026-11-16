import type { SupabaseClient } from "@supabase/supabase-js";
import type { KairosAIDatabase, KairosAIInteraction, KairosAIOutput } from "../types/kairos-ai";

export const KAIROS_AI_HISTORY_LIMIT = 50;
export const kairosAIHistoryKey = (userId: string) => ["kairos-ai-interactions", userId] as const;
export const KAIROS_AI_SENSITIVE_META = { sensitive: true };

export async function fetchKairosAIHistory(client: SupabaseClient<KairosAIDatabase>, userId: string): Promise<KairosAIInteraction[]> {
  const result = await client.from("kairos_ai_interactions")
    .select("id,user_id,query,response,mode,provider,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false }).order("id", { ascending: false })
    .limit(KAIROS_AI_HISTORY_LIMIT);
  if (result.error) throw new Error("Kairos history could not be loaded. The reviewed assistant schema may not be installed yet.");
  return [...(result.data ?? [])].reverse();
}
export type KairosAITurn = { requestId: string; query: string; result: KairosAIOutput | null };
export type KairosAISession = { accountId: string | null; turns: KairosAITurn[] };
export type KairosAIMessage = { id: string; role: "user" | "assistant"; content: string };
export const createKairosAISession = (accountId: string | null): KairosAISession => ({ accountId, turns: [] });
export function beginKairosAITurn(session: KairosAISession, accountId: string, requestId: string, query: string): KairosAISession {
  const current = session.accountId === accountId ? session : createKairosAISession(accountId);
  if (current.turns.some((turn) => turn.requestId === requestId)) return current;
  return { ...current, turns: [...current.turns, { requestId, query, result: null }] };
}
export function completeKairosAITurn(session: KairosAISession, accountId: string, requestId: string, result: KairosAIOutput): KairosAISession {
  if (session.accountId !== accountId) return session;
  return { ...session, turns: session.turns.map((turn) => turn.requestId === requestId && !turn.result ? { ...turn, result } : turn) };
}
export function failKairosAITurn(session: KairosAISession, accountId: string, requestId: string): KairosAISession {
  if (session.accountId !== accountId) return session;
  return { ...session, turns: session.turns.filter((turn) => turn.requestId !== requestId || turn.result) };
}
export function buildKairosAIMessages(history: readonly KairosAIInteraction[], session: KairosAISession, accountId: string | null): KairosAIMessage[] {
  if (!accountId) return [];
  const seen = new Set<string>();
  const pair = (id: string, query: string, response: string): KairosAIMessage[] => [
    { id: `${id}-user`, role: "user", content: query },
    { id: `${id}-assistant`, role: "assistant", content: response },
  ];
  const groups = history.filter((row) => {
    if (row.user_id !== accountId || seen.has(row.id)) return false;
    seen.add(row.id); return true;
  }).map((row) => ({ id: row.id, messages: pair(row.id, row.query, row.response) }));
  const turns = session.accountId === accountId ? session.turns : [];
  turns.forEach((turn, index) => {
    if (turn.result && seen.has(turn.result.interaction_id)) return;
    const nextKnown = new Set(turns.slice(index + 1).flatMap((next) => next.result ? [next.result.interaction_id] : []));
    const anchor = groups.findIndex((group) => nextKnown.has(group.id));
    groups.splice(anchor < 0 ? groups.length : anchor, 0, {
      id: turn.result?.interaction_id ?? `pending:${turn.requestId}`,
      messages: turn.result ? pair(turn.result.interaction_id, turn.query, turn.result.response)
        : [{ id: `${turn.requestId}-user`, role: "user", content: turn.query }],
    });
    if (turn.result) seen.add(turn.result.interaction_id);
  });
  return groups.flatMap((group) => group.messages);
}
