import type { SupabaseClient } from "@supabase/supabase-js";

import type { ChatMessageModel } from "../components/ai/chat-message";
import type { Interaction } from "../types/app";
import type { Database } from "../types/database";
import type { EvergreenQueryData } from "../types/evergreen";
import { getConfidenceLevel } from "./frontend-validation";

export const CHAT_HISTORY_LIMIT = 50;

export async function fetchLatestChatHistory(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<Interaction[]> {
  const result = await supabase
    .from("interactions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(CHAT_HISTORY_LIMIT);
  if (result.error) throw result.error;
  // Reverse the database's total order, preserving timestamp precision and ties.
  return [...(result.data ?? [])].reverse();
}

type LocalChatTurn = {
  requestId: string;
  query: string;
  result: EvergreenQueryData | null;
};

export type ChatSession = {
  accountId: string | null;
  turns: LocalChatTurn[];
};

export function createChatSession(accountId: string | null): ChatSession {
  return { accountId, turns: [] };
}

export function beginChatTurn(
  session: ChatSession,
  accountId: string,
  requestId: string,
  query: string,
): ChatSession {
  const current = session.accountId === accountId ? session : createChatSession(accountId);
  if (current.turns.some((turn) => turn.requestId === requestId)) return current;
  return { ...current, turns: [...current.turns, { requestId, query, result: null }] };
}

export function completeChatTurn(
  session: ChatSession,
  accountId: string,
  requestId: string,
  result: EvergreenQueryData,
): ChatSession {
  if (session.accountId !== accountId) return session;
  return {
    ...session,
    turns: session.turns.map((turn) =>
      turn.requestId === requestId && !turn.result ? { ...turn, result } : turn,
    ),
  };
}

export function failChatTurn(session: ChatSession, accountId: string, requestId: string): ChatSession {
  if (session.accountId !== accountId) return session;
  return { ...session, turns: session.turns.filter((turn) => turn.requestId !== requestId || turn.result) };
}

export function buildChatMessages(
  interactions: readonly Interaction[],
  session: ChatSession,
  accountId: string | null,
): ChatMessageModel[] {
  if (!accountId) return [];
  const seen = new Set<string>();
  const groups = interactions.filter((interaction) => {
    if (interaction.user_id !== accountId || seen.has(interaction.id)) return false;
    seen.add(interaction.id);
    return true;
  }).map((interaction) => ({
    interactionId: interaction.id,
    messages: [
      { id: `${interaction.id}-user`, role: "user", content: interaction.query },
      {
        id: `${interaction.id}-assistant`,
        role: "assistant",
        content: interaction.response,
        interactionId: interaction.id,
        confidence: interaction.confidence,
        confidenceLevel: getConfidenceLevel(interaction.confidence),
      },
    ] as ChatMessageModel[],
  }));

  const turns = session.accountId === accountId ? session.turns : [];
  turns.forEach((turn, index) => {
    const result = turn.result;
    if (result && seen.has(result.interaction_id)) return;
    const messages: ChatMessageModel[] = result ? [
      { id: `${result.interaction_id}-user`, role: "user", content: turn.query },
      {
        id: `${result.interaction_id}-assistant`,
        role: "assistant",
        content: result.response,
        interactionId: result.interaction_id,
        confidence: result.confidence,
        confidenceLevel: result.confidence_level,
      },
    ] : [{ id: `${turn.requestId}-user`, role: "user", content: turn.query }];
    // An incomplete refetch may contain a later send but not an earlier one.
    // Anchor missing pairs before the next known local turn rather than reorder
    // the server's chronological history or compare guessed device timestamps.
    const nextKnownIds = new Set(turns.slice(index + 1).flatMap((next) =>
      next.result ? [next.result.interaction_id] : [],
    ));
    const anchor = groups.findIndex((group) => nextKnownIds.has(group.interactionId));
    groups.splice(anchor < 0 ? groups.length : anchor, 0, {
      interactionId: result?.interaction_id ?? `pending:${turn.requestId}`,
      messages,
    });
    if (result) seen.add(result.interaction_id);
  });
  // Retain successful local pairs for this screen session, even after one
  // refetch has seen them, so a delayed/stale snapshot cannot remove them.
  return groups.flatMap((group) => group.messages);
}
