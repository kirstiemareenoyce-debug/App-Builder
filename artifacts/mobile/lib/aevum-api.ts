import { getSupabaseClient } from "@/lib/supabase";
import { KairosApiError } from "@/lib/evergreen-api";

export type AevumCoachingMode = "individual_reflection" | "conflict_navigator" | "couple_coaching" | "trauma_informed";
export type AevumCoachingContext = {
  stageSummaries?: string[];
  consentedTriggers?: string[];
  communicationPreferences?: string[];
  baselineSummary?: string;
  sharedGoals?: string[];
};
export type AevumCoachingInput = { mode: AevumCoachingMode; prompt: string; context: AevumCoachingContext };
// Captured by the deliberate coaching action, never inferred from a later session.
export type AevumCoachingVariables = AevumCoachingInput & { expectedOwner: string };
export type AevumCoachingOutput = { response: string; escalated: boolean; coaching_session_id: string | null; provider?: string };

type Envelope<T> = { success: true; data: T } | { success: false; error: { message: string; code: string; request_id?: string } };

export async function requestAevumCoaching(input: AevumCoachingVariables) {
  const { expectedOwner } = input;
  if (!expectedOwner) {
    throw new KairosApiError("Your session expired. Sign in before requesting coaching.", "AUTH_REQUIRED");
  }
  // Project only the backend's existing fields, including nested context. Local
  // owner metadata (or unexpected JS properties) must never become AI context.
  const { stageSummaries, consentedTriggers, communicationPreferences, baselineSummary, sharedGoals } = input.context;
  const body: AevumCoachingInput = {
    mode: input.mode,
    prompt: input.prompt,
    context: {
      ...(stageSummaries !== undefined ? { stageSummaries } : {}),
      ...(consentedTriggers !== undefined ? { consentedTriggers } : {}),
      ...(communicationPreferences !== undefined ? { communicationPreferences } : {}),
      ...(baselineSummary !== undefined ? { baselineSummary } : {}),
      ...(sharedGoals !== undefined ? { sharedGoals } : {}),
    },
  };
  const supabase = getSupabaseClient();
  const { data: auth, error: authError } = await supabase.auth.getSession();
  if (authError || !auth.session?.user.id || auth.session.user.id !== expectedOwner || !auth.session.access_token) {
    throw new KairosApiError("Your session expired. Sign in before requesting coaching.", "AUTH_REQUIRED");
  }
  // Pin the matching session's bearer before the SDK's later global session
  // lookup; an account switch must not reattribute this prompt.
  const bearer = auth.session.access_token;
  const { data, error } = await supabase.functions.invoke<Envelope<AevumCoachingOutput>>("aevum-coaching", {
    body, headers: { Authorization: `Bearer ${bearer}` },
  });
  if (error) throw new KairosApiError(error.message);
  if (!data) throw new KairosApiError("The coaching service returned an empty response.");
  if (!data.success) throw new KairosApiError(data.error.message, data.error.code, data.error.request_id);
  return data.data;
}
