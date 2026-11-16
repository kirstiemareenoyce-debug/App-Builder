import { useQuery } from "@tanstack/react-query";

import { getOptionalSupabaseClient } from "@/lib/supabase";
import { useKairosAuth } from "@/providers/supabase-auth-provider";
import type { Tables } from "@/types/database";

export type SourceBriefTaskRecord = Tables<"source_brief_tasks">;

export function useSourceBriefTasks(pollWhileProcessing = false) {
  const { user } = useKairosAuth();
  return useQuery({
    queryKey: ["source-brief-tasks", user?.id ?? "anonymous"],
    enabled: Boolean(user && !user.isPreview),
    meta: { sensitive: true },
    queryFn: async (): Promise<SourceBriefTaskRecord[]> => {
      if (!user || user.isPreview) return [];
      const client = getOptionalSupabaseClient();
      if (!client) throw new Error("Supabase is not configured for private source tasks.");
      const result = await client.from("source_brief_tasks").select("*").order("created_at", { ascending: false }).limit(30);
      if (result.error) throw result.error;
      return result.data ?? [];
    },
    refetchInterval: (query) => pollWhileProcessing || Boolean(query.state.data?.some((task) =>
      task.status === "pending" || task.status === "retrieving" || task.status === "generating"
    )) ? 1_500 : false,
  });
}
