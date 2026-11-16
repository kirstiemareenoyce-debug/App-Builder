import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getOptionalSupabaseClient } from "@/lib/supabase";
import { useKairosAuth } from "@/providers/supabase-auth-provider";
import { queryKeys, type SleepLog } from "@/types/app";
import type { TablesInsert } from "@/types/database";

export function useSleepLogs() {
  const { user } = useKairosAuth();
  const userId = user?.id ?? "anonymous";
  return useQuery({
    queryKey: queryKeys.sleep(userId),
    enabled: Boolean(user && !user.isPreview),
    queryFn: async (): Promise<SleepLog[]> => {
      const supabase = getOptionalSupabaseClient();
      if (!supabase) throw new Error("Supabase configuration is unavailable.");
      const result = await supabase.from("sleep_logs").select("*").order("logged_at", { ascending: false }).limit(200);
      if (result.error) throw result.error;
      return result.data ?? [];
    },
  });
}

export function useCreateSleepLog() {
  const { user } = useKairosAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<TablesInsert<"sleep_logs">, "user_id">) => {
      if (!user) throw new Error("Sign in to log sleep.");
      if (user.isPreview) throw new Error("Connect Supabase to save sleep entries from preview mode.");
      const supabase = getOptionalSupabaseClient();
      if (!supabase) throw new Error("Supabase configuration is unavailable.");
      const result = await supabase.from("sleep_logs").insert({ ...input, user_id: user.id }).select("*").single();
      if (result.error) throw result.error;
      return result.data;
    },
    onSuccess: async () => {
      if (user) await queryClient.invalidateQueries({ queryKey: queryKeys.sleep(user.id) });
    },
  });
}
