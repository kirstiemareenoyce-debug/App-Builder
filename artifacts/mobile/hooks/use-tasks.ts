import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getOptionalSupabaseClient } from "@/lib/supabase";
import { useKairosAuth } from "@/providers/supabase-auth-provider";
import { queryKeys, type Task } from "@/types/app";
import type { TablesInsert, TablesUpdate } from "@/types/database";

export function useTasks() {
  const { user } = useKairosAuth();
  const userId = user?.id ?? "anonymous";
  return useQuery({
    queryKey: queryKeys.tasks(userId),
    enabled: Boolean(user && !user.isPreview),
    queryFn: async (): Promise<Task[]> => {
      const supabase = getOptionalSupabaseClient();
      if (!supabase) throw new Error("Supabase configuration is unavailable.");
      const result = await supabase.from("tasks").select("*").order("created_at", { ascending: false }).limit(300);
      if (result.error) throw result.error;
      return result.data ?? [];
    },
  });
}

function useInvalidateTasks() {
  const { user } = useKairosAuth();
  const queryClient = useQueryClient();
  return async () => {
    if (user) await queryClient.invalidateQueries({ queryKey: queryKeys.tasks(user.id) });
  };
}

export function useCreateTask() {
  const { user } = useKairosAuth();
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: async (input: Omit<TablesInsert<"tasks">, "user_id">) => {
      if (!user) throw new Error("Sign in to create tasks.");
      if (user.isPreview) throw new Error("Connect Supabase to save tasks from preview mode.");
      const supabase = getOptionalSupabaseClient();
      if (!supabase) throw new Error("Supabase configuration is unavailable.");
      const result = await supabase.from("tasks").insert({ ...input, user_id: user.id }).select("*").single();
      if (result.error) throw result.error;
      return result.data;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateTask() {
  const { user } = useKairosAuth();
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: TablesUpdate<"tasks"> }) => {
      if (!user) throw new Error("Sign in to update tasks.");
      if (user.isPreview) throw new Error("Connect Supabase to update tasks from preview mode.");
      const supabase = getOptionalSupabaseClient();
      if (!supabase) throw new Error("Supabase configuration is unavailable.");
      const result = await supabase.from("tasks").update(updates).eq("id", id).select("*").single();
      if (result.error) throw result.error;
      return result.data;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteTask() {
  const { user } = useKairosAuth();
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error("Sign in to delete tasks.");
      if (user.isPreview) throw new Error("Connect Supabase to delete tasks from preview mode.");
      const supabase = getOptionalSupabaseClient();
      if (!supabase) throw new Error("Supabase configuration is unavailable.");
      const result = await supabase.from("tasks").delete().eq("id", id);
      if (result.error) throw result.error;
      return id;
    },
    onSuccess: invalidate,
  });
}
