import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";
import { HttpError } from "./errors.ts";

const unavailable = () => new HttpError(503, "DEPENDENCY_ERROR",
  "Kairos could not check your daily AI allowance. Your message has not been sent to an AI provider. Your draft is still here.");

const paused = () => new HttpError(503, "PROJECT_AI_PAUSED",
  "Kairos AI is temporarily paused. Your draft is still here. Please try again later.");

// This check can run between Kimi and fallback: never claim that no provider
// processed the request, or that retrying cannot incur another charge.
const pauseUnavailable = () => new HttpError(503, "DEPENDENCY_ERROR",
  "Kairos could not confirm AI availability. Your draft is still here. An earlier provider attempt may already have processed this request; retrying can send it again.");

/** Recheck without caching before each paid provider, including fallback. */
export async function assertKairosAIEnabled(client: SupabaseClient): Promise<void> {
  let enabled: unknown;
  try {
    const result = await client.rpc("kairos_ai_request_enabled");
    if (result.error) throw pauseUnavailable();
    enabled = result.data;
  } catch {
    throw pauseUnavailable();
  }
  if (enabled === false) throw paused();
  if (enabled !== true) throw pauseUnavailable();
}

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
    !Number.isInteger(row.used) || row.used < 0 || row.used > row.daily_limit ||
    !Number.isInteger(row.project_daily_limit) || row.project_daily_limit < 0 ||
    !Number.isInteger(row.project_used) || row.project_used < 0 ||
    !["allowed", "paused", "project_limit", "user_limit"].includes(row.reason) ||
    row.allowed !== (row.reason === "allowed") ||
    (row.allowed && (row.used < 1 || row.project_used < 1 ||
      row.project_used > row.project_daily_limit)) ||
    (row.reason === "user_limit" && row.used !== row.daily_limit) ||
    (row.reason === "project_limit" && (row.project_daily_limit < 1 ||
      row.project_used < row.project_daily_limit)) ||
    typeof row.resets_at !== "string" || !Number.isFinite(Date.parse(row.resets_at))) {
    throw unavailable();
  }
  if (row.reason === "paused") throw paused();
  if (row.reason === "project_limit") {
    throw new HttpError(429, "PROJECT_AI_LIMIT_REACHED",
      "Kairos has reached its shared daily AI limit. Try again after 00:00 UTC. Your draft is still here; this message was not sent to an AI provider.",
      { resets_at: row.resets_at });
  }
  if (!row.allowed) {
    throw new HttpError(429, "DAILY_AI_LIMIT_REACHED",
      "You've reached your daily Kairos AI limit. Try again after 00:00 UTC. Your draft is still here; this message was not sent to an AI provider.",
      { resets_at: row.resets_at, daily_limit: row.daily_limit });
  }
}
