import { getSupabaseClient } from "@/lib/supabase";
import type { DiscoveryScope } from "@/lib/source-discovery";

export type SourceBriefInput = {
  goal: string;
  scope: DiscoveryScope;
  selected_sources: { url: string; title: string; origin: "candidate" | "manual" }[];
  task_ai_consent: true;
};

export type SourceBriefTask = {
  id: string;
  status: "pending" | "retrieving" | "generating" | "completed" | "failed";
  markdown: string | null;
  source_label?: "Read by AI; not independently fact-verified";
  error?: string | null;
  selected_sources: { url: string; title: string; origin: "candidate" | "manual" }[];
};

type FunctionEnvelope = { success: boolean; data?: SourceBriefTask; error?: { message?: string } };

export async function createSourceBrief(input: SourceBriefInput): Promise<SourceBriefTask> {
  if (input.goal.trim().length < 3 || input.goal.trim().length > 2000) throw new Error("Enter a task goal between 3 and 2,000 characters.");
  if (input.selected_sources.length < 1 || input.selected_sources.length > 3) throw new Error("Choose between one and three source links.");
  const { data, error } = await getSupabaseClient().functions.invoke<FunctionEnvelope>("source-brief", { body: input });
  if (error) throw error;
  if (!data?.success || !data.data) throw new Error(data?.error?.message ?? "The source brief service is unavailable.");
  return data.data;
}
