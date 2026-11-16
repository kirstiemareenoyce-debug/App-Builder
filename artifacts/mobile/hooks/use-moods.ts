import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getOptionalSupabaseClient } from "@/lib/supabase";
import { useKairosAuth } from "@/providers/supabase-auth-provider";
import { queryKeys, type Mood } from "@/types/app";
import type { TablesInsert } from "@/types/database";

export function useMoods() {
  const { user } = useKairosAuth();
  const userId = user?.id ?? "anonymous";
  return useQuery({
    queryKey: queryKeys.moods(userId),
    enabled: Boolean(user && !user.isPreview),
    queryFn: async (): Promise<Mood[]> => {
      const supabase = getOptionalSupabaseClient();
      if (!supabase) throw new Error("Supabase configuration is unavailable.");
      const result = await supabase.from("moods").select("*").order("logged_at", { ascending: false }).limit(200);
      if (result.error) throw result.error;
      return result.data ?? [];
    },
  });
}

export function useCreateMood() {
  const { user } = useKairosAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<TablesInsert<"moods">, "user_id">) => {
      if (!user) throw new Error("Sign in to log your mood.");
      if (user.isPreview) throw new Error("Connect Supabase to save mood entries from preview mode.");
      const supabase = getOptionalSupabaseClient();
      if (!supabase) throw new Error("Supabase configuration is unavailable.");
      const result = await supabase.from("moods").insert({ ...input, user_id: user.id }).select("*").single();
      if (result.error) throw result.error;
      return result.data;
    },
    onSuccess: async () => {
      if (user) await queryClient.invalidateQueries({ queryKey: queryKeys.moods(user.id) });
    },
  });
}
