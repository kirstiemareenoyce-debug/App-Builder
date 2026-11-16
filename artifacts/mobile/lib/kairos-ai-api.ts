import { z } from "zod";
import { getSupabaseClient } from "@/lib/supabase";
import { KairosApiError } from "@/lib/evergreen-api";
import { kairosAIErrorMessage } from "@/lib/kairos-ai-errors";
import type { KairosAIInput, KairosAIOutput } from "@/types/kairos-ai";

export const kairosAIInputSchema = z.object({
  query: z.string().trim().min(1, "Write a message first.").max(2000, "Keep messages under 2,000 characters."),
  mode: z.enum(["learning", "reflection"]),
  ai_use_consent: z.literal(true, { error: "Choose whether to use AI before sending." }),
  storage_consent: z.literal(true, { error: "Choose whether to save private history before sending." }),
}).strict();
const outputSchema = z.object({
  interaction_id: z.string().uuid(), response: z.string().trim().min(1),
  mode: z.enum(["learning", "reflection"]), provider: z.string().min(1),
});
type Envelope = { success: true; data: KairosAIOutput } | {
  success: false; error: { message: string; code: string; request_id?: string };
};

export async function queryKairosAI(input: KairosAIInput, expectedUserId: string): Promise<KairosAIOutput> {
  const parsed = kairosAIInputSchema.parse(input);
  const client = getSupabaseClient();
  const { data: auth, error: authError } = await client.auth.getSession();
  if (authError || !auth.session || auth.session.user.id !== expectedUserId) {
    throw new KairosApiError("Your account changed or your session expired. Sign in before sending.", "AUTH_REQUIRED");
  }
  // Pin the initiating token; never allow an account switch to send A's text as B.
  const { data, error } = await client.functions.invoke<Envelope>("kairos-query", {
    body: parsed, headers: { Authorization: `Bearer ${auth.session.access_token}` },
  });
  if (error) {
    // FunctionsHttpError may hold the safe server envelope even on non-2xx status.
    const context = "context" in error ? error.context : null;
    if (context instanceof Response) {
      const envelope = await context.clone().json().catch(() => null) as Envelope | null;
      if (envelope?.success === false) {
        throw new KairosApiError(kairosAIErrorMessage(envelope.error), envelope.error.code, envelope.error.request_id);
      }
    }
    throw new KairosApiError("Kairos AI is unavailable. Your draft is still here; setup or your connection may need review.");
  }
  if (!data) throw new KairosApiError("Kairos AI returned no response. Your draft is still here.");
  if (!data.success) throw new KairosApiError(kairosAIErrorMessage(data.error), data.error.code, data.error.request_id);
  const output = outputSchema.safeParse(data.data);
  if (!output.success) throw new KairosApiError("Kairos AI returned an invalid response. Your draft is still here.");
  return output.data;
}
