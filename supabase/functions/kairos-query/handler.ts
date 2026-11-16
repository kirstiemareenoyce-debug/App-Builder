import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";
import { handlePreflight } from "../_shared/cors.ts";
import { HttpError } from "../_shared/errors.ts";
import { getRequestId, readJsonBounded } from "../_shared/request.ts";
import { errorResponse, methodNotAllowed, successResponse } from "../_shared/responses.ts";
import { reserveKairosAIRequest } from "../_shared/request-budget.ts";
import {
  buildKairosUserPrompt, kairosQuerySchema, KAIROS_SYSTEM_PROMPT,
  KAIROS_AI_CONSENT_VERSION, KAIROS_STORAGE_CONSENT_VERSION,
} from "./prompt.ts";

export type KairosQueryDependencies = {
  authenticate: (request: Request) => Promise<{ user: { id: string }; userClient: SupabaseClient }>;
  complete: (system: string, message: string, requestId: string) => Promise<{ text: string; provider: string }>;
  serviceClient: () => SupabaseClient;
};

export async function handleKairosQuery(request: Request, dependencies: KairosQueryDependencies): Promise<Response> {
  const preflight = handlePreflight(request);
  if (preflight) return preflight;
  const requestId = getRequestId(request);
  if (request.method !== "POST") return methodNotAllowed(request, ["POST"], requestId);
  try {
    const { user, userClient } = await dependencies.authenticate(request);
    const parsed = kairosQuerySchema.safeParse(await readJsonBounded(request, 12_000));
    if (!parsed.success) {
      throw new HttpError(400, "VALIDATION_ERROR", "Send a message of 1–2,000 characters, a supported mode, and separate AI-use and private-history consent. No additional context is accepted.");
    }
    const body = parsed.data;
    // Fail before paid generation if the owner-only history dependency is absent.
    // No saved history is passed as model context.
    const dependency = await userClient.from("kairos_ai_interactions")
      .select("id").eq("user_id", user.id).limit(1);
    if (dependency.error) {
      throw new HttpError(503, "DEPENDENCY_ERROR", "Kairos private history setup is unavailable. Your message has not been sent to an AI provider.");
    }
    const serviceClient = dependencies.serviceClient();
    await reserveKairosAIRequest(serviceClient, user.id);
    const completion = await dependencies.complete(KAIROS_SYSTEM_PROMPT, buildKairosUserPrompt(body), requestId);
    const saved = await serviceClient.from("kairos_ai_interactions").insert({
      user_id: user.id, query: body.query, response: completion.text,
      mode: body.mode, provider: completion.provider,
      ai_use_consent_version: KAIROS_AI_CONSENT_VERSION,
      storage_consent_version: KAIROS_STORAGE_CONSENT_VERSION,
      consented_at: new Date().toISOString(),
    }).select("id").single();
    if (saved.error || !saved.data) {
      throw new HttpError(502, "DEPENDENCY_ERROR", "The AI provider processed this message, but Kairos could not save the private reply. Your draft is retained; retrying sends it again.");
    }
    return successResponse(request, {
      interaction_id: saved.data.id, response: completion.text,
      mode: body.mode, provider: completion.provider,
    });
  } catch (error) {
    // No personal text, provider reply or credentials are logged.
    if (!(error instanceof HttpError)) console.error("kairos-query failed", {
      requestId, errorType: error instanceof Error ? error.name : "UnknownError",
    });
    const safeError = error instanceof HttpError && error.code === "AI_UNAVAILABLE"
      ? new HttpError(503, "AI_UNAVAILABLE", "Kairos AI is temporarily unavailable. No simulated response has been substituted.")
      : error;
    return errorResponse(request, safeError, requestId);
  }
}
