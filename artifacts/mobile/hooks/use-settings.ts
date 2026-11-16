import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getOptionalSupabaseClient } from "@/lib/supabase";
import { useKairosAuth } from "@/providers/supabase-auth-provider";
import { queryKeys, type AppSettings } from "@/types/app";
import type { TablesUpdate } from "@/types/database";

export function useAppSettings() {
  const { user } = useKairosAuth();
  const userId = user?.id ?? "anonymous";
  return useQuery({
    queryKey: queryKeys.settings(userId),
    enabled: Boolean(user && !user.isPreview),
    queryFn: async (): Promise<AppSettings | null> => {
      const supabase = getOptionalSupabaseClient();
      if (!supabase) throw new Error("Supabase configuration is unavailable.");
      const result = await supabase.from("app_settings").select("*").maybeSingle();
      if (result.error) throw result.error;
      return result.data;
    },
  });
}

export function useUpdateAppSettings() {
  const { user } = useKairosAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (updates: TablesUpdate<"app_settings">) => {
      if (!user) throw new Error("Sign in to update settings.");
      if (user.isPreview) throw new Error("Connect Supabase to save settings from preview mode.");
      const supabase = getOptionalSupabaseClient();
      if (!supabase) throw new Error("Supabase configuration is unavailable.");
      const result = await supabase
        .from("app_settings")
        .upsert({ user_id: user.id, ...updates }, { onConflict: "user_id" })
        .select("*")
        .single();
      if (result.error) throw result.error;
      return result.data;
    },
    onSuccess: async () => {
      if (user) await queryClient.invalidateQueries({ queryKey: queryKeys.settings(user.id) });
    },
  });
}
