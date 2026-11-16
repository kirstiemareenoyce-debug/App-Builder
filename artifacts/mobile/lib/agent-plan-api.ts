import { getSupabaseClient } from "@/lib/supabase";
import type { ApiEnvelope } from "@/types/evergreen";

export interface AgentPlanRequest {
  goal: string;
  file_name: string | null;
  file_text: string;
  memories: { title: string; content: string }[];
}

export interface AgentPlanResponse {
  response: string;
  provider: "openai" | "kimi";
}

export class AgentPlanApiError extends Error {
  readonly code: string;
  readonly requestId?: string;

  constructor(message: string, code = "EDGE_FUNCTION_ERROR", requestId?: string) {
    super(message);
    this.name = "AgentPlanApiError";
    this.code = code;
    this.requestId = requestId;
  }
}

export async function requestAgentPlan(input: AgentPlanRequest): Promise<AgentPlanResponse> {
  const { data, error } = await getSupabaseClient().functions.invoke<ApiEnvelope<AgentPlanResponse>>("agent-plan", {
    method: "POST",
    body: input,
  });

  if (error) throw new AgentPlanApiError(error.message);
  if (!data) throw new AgentPlanApiError("The server returned an empty response.");
  if (!data.success) {
    throw new AgentPlanApiError(data.error.message, data.error.code, data.error.request_id);
  }
  if (typeof data.data.response !== "string" || !["openai", "kimi"].includes(data.data.provider)) {
    throw new AgentPlanApiError("The server returned an invalid plan response.", "INVALID_RESPONSE");
  }
  return data.data;
}
