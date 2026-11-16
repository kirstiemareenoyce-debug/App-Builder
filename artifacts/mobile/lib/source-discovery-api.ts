import { getSupabaseClient } from "@/lib/supabase";
import type { DiscoveryScope, SourceCandidate } from "@/lib/source-discovery";

export type SourceDiscoveryResult = {
  request_key: string;
  goal_hash: string;
  candidates: SourceCandidate[];
  label: "Not read or fact-verified";
  task_pipeline: "connected";
};

export async function discoverSources(input: {
  goal: string;
  scope: DiscoveryScope;
  search_ai_consent: true;
}): Promise<SourceDiscoveryResult> {
  const requestKey = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  const { data, error } = await getSupabaseClient().functions.invoke<{
    success: boolean;
    data?: SourceDiscoveryResult;
    error?: { message?: string };
  }>("source-discovery", {
    body: input,
    headers: { "x-request-id": requestKey },
  });
  if (error) throw error;
  if (!data?.success || !data.data) throw new Error(data?.error?.message ?? "Source discovery is unavailable.");
  return data.data;
}
