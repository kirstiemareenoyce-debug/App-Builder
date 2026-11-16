import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";
import { HttpError } from "./errors.ts";

const unavailable = () => new HttpError(503, "DEPENDENCY_ERROR",
  "Kairos could not check your daily AI allowance. Your message has not been sent to an AI provider. Your draft is still here.");

/** One committed reservation covers Kimi plus its bounded OpenAI fallback. */
export async function reserveKairosAIRequest(client: SupabaseClient, userId: string): Promise<void> {
  let data: unknown;
  try {
    const result = await client.rpc("reserve_kairos_ai_request", { p_user_id: userId });
    if (result.error) throw unavailable();
    data = result.data;
  } catch {
    // A timeout can mean the reservation committed. Never retry the RPC or
    // generate without an affirmative result, and never expose database errors.
    throw unavailable();
  }
  const row = Array.isArray(data) && data.length === 1 ? data[0] : null;
  if (!row || typeof row.allowed !== "boolean" ||
    !Number.isInteger(row.daily_limit) || row.daily_limit < 1 ||
    !Number.isInteger(row.used) || row.used < 1 || row.used > row.daily_limit ||
    (!row.allowed && row.used !== row.daily_limit) ||
    typeof row.resets_at !== "string" || !Number.isFinite(Date.parse(row.resets_at))) {
    throw unavailable();
  }
  if (!row.allowed) {
    throw new HttpError(429, "DAILY_AI_LIMIT_REACHED",
      "You've reached your daily Kairos AI limit. Try again after 00:00 UTC. Your draft is still here; this message was not sent to an AI provider.",
      { resets_at: row.resets_at, daily_limit: row.daily_limit });
  }
}
