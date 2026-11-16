import { getSupabaseClient } from "@/lib/supabase";

export type SourceAiConsentScope = "search" | "brief";
export const SOURCE_AI_CONSENT_VERSIONS: Record<SourceAiConsentScope, string> = {
  search: "source-search-2026-11-15-v1",
  brief: "source-brief-2026-11-15-v1",
};

type ConsentRow = {
  user_id: string;
  scope: SourceAiConsentScope;
  version: string;
  granted: boolean;
  granted_at: string | null;
  revoked_at: string | null;
};
type ConsentClient = {
  from: (table: "source_ai_consents") => {
    upsert: (row: ConsentRow, options: { onConflict: "user_id,scope" }) => PromiseLike<{ error: { message?: string } | null }>;
  };
};

export async function saveSourceAiConsent(input: { userId: string; scope: SourceAiConsentScope; granted: boolean }): Promise<void> {
  const now = new Date().toISOString();
  const row: ConsentRow = {
    user_id: input.userId,
    scope: input.scope,
    version: SOURCE_AI_CONSENT_VERSIONS[input.scope],
    granted: input.granted,
    granted_at: input.granted ? now : null,
    revoked_at: input.granted ? null : now,
  };
  const client = getSupabaseClient() as unknown as ConsentClient;
  const { error } = await client.from("source_ai_consents").upsert(row, { onConflict: "user_id,scope" });
  if (error) throw new Error(error.message ?? "Your source AI consent could not be saved.");
}
