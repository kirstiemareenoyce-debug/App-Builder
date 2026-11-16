import type {
  ApiEnvelope,
  EvergreenFeedbackData,
  EvergreenFeedbackInput,
  EvergreenMetricsData,
  EvergreenQueryData,
  EvergreenQueryInput,
} from "@/types/evergreen";
import { getSupabaseClient } from "@/lib/supabase";

// Ownership belongs to the local mutation, never to the model/request body.
export type EvergreenQueryVariables = EvergreenQueryInput & { expectedOwner: string };
export type EvergreenFeedbackVariables = EvergreenFeedbackInput & { expectedOwner: string };

export class KairosApiError extends Error {
  readonly code: string;
  readonly requestId?: string;

  constructor(message: string, code = "EDGE_FUNCTION_ERROR", requestId?: string) {
    super(message);
    this.name = "KairosApiError";
    this.code = code;
    this.requestId = requestId;
  }
}

function unwrap<T>(envelope: ApiEnvelope<T> | null): T {
  if (!envelope) throw new KairosApiError("The server returned an empty response.");
  if (!envelope.success) {
    throw new KairosApiError(envelope.error.message, envelope.error.code, envelope.error.request_id);
  }
  return envelope.data;
}

async function invoke<TData, TBody extends object | undefined>(
  functionName: string,
  options?: { method?: "GET" | "POST"; body?: TBody; expectedOwner?: string },
): Promise<TData> {
  const supabase = getSupabaseClient();
  let headers: { Authorization: string } | undefined;
  if (options?.expectedOwner !== undefined) {
    const { data: auth, error: authError } = await supabase.auth.getSession();
    if (authError || !options.expectedOwner || !auth.session?.access_token ||
      auth.session.user.id !== options.expectedOwner) {
      throw new KairosApiError("Your account changed or your session expired. Sign in before sending.", "AUTH_REQUIRED");
    }
    // The SDK re-reads global auth at fetch time. An explicit bearer keeps an
    // account switch from sending or saving the initiating owner's input as B.
    headers = { Authorization: `Bearer ${auth.session.access_token}` };
  }
  const { data, error } = await supabase.functions.invoke<ApiEnvelope<TData>>(functionName, {
    method: options?.method ?? "POST",
    ...(options?.body ? { body: options.body } : {}),
    ...(headers ? { headers } : {}),
  });
  if (error) throw new KairosApiError(error.message);
  return unwrap(data);
}

export function queryEvergreen(input: EvergreenQueryVariables): Promise<EvergreenQueryData> {
  // Explicitly project backend fields: expectedOwner and any extra local state
  // must never become model context, even if a caller passes a wider object.
  const body: EvergreenQueryInput = { query: input.query };
  return invoke<EvergreenQueryData, EvergreenQueryInput>("evergreen-query", {
    body, expectedOwner: input.expectedOwner || "",
  });
}

export function submitEvergreenFeedback(
  input: EvergreenFeedbackVariables,
): Promise<EvergreenFeedbackData> {
  const body: EvergreenFeedbackInput = {
    interaction_id: input.interaction_id,
    rating: input.rating,
    ...(input.correction !== undefined ? { correction: input.correction } : {}),
    ...(input.category !== undefined ? { category: input.category } : {}),
  };
  return invoke<EvergreenFeedbackData, EvergreenFeedbackInput>("evergreen-feedback", {
    body, expectedOwner: input.expectedOwner || "",
  });
}

export function getEvergreenMetrics(): Promise<EvergreenMetricsData> {
  return invoke<EvergreenMetricsData, undefined>("evergreen-metrics", { method: "GET" });
}
