import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getOptionalSupabaseClient } from "@/lib/supabase";
import { useKairosAuth } from "@/providers/supabase-auth-provider";
import { queryKeys, type Note } from "@/types/app";
import type { Database, TablesInsert, TablesUpdate } from "@/types/database";

type NoteSearchResult = Database["public"]["Functions"]["search_notes"]["Returns"][number];

// Keep detail queries under the same owner prefix as the list and full-text search.
export const noteDetailKey = (userId: string, id: string) => [...queryKeys.notes(userId), "detail", id] as const;

export function useNotes() {
  const { user } = useKairosAuth();
  const userId = user?.id ?? "anonymous";
  return useQuery({
    queryKey: queryKeys.notes(userId),
    enabled: Boolean(user && !user.isPreview),
    queryFn: async (): Promise<Note[]> => {
      if (!user || user.isPreview) throw new Error("Sign in to load notes.");
      const supabase = getOptionalSupabaseClient();
      if (!supabase) throw new Error("Supabase configuration is unavailable.");
      const result = await supabase.from("notes").select("*").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(300);
      if (result.error) throw result.error;
      return result.data ?? [];
    },
  });
}

export function useNote(id?: string) {
  const { user } = useKairosAuth();
  // Disabled preview/signed-out queries must not read a signed-in account's cache.
  const userId = user && !user.isPreview ? user.id : "anonymous";
  return useQuery({
    queryKey: noteDetailKey(userId, id ?? ""),
    enabled: Boolean(user && !user.isPreview && id),
    queryFn: async (): Promise<Note | null> => {
      if (!user || user.isPreview) throw new Error("Sign in to load notes.");
      if (!id) return null;
      const supabase = getOptionalSupabaseClient();
      if (!supabase) throw new Error("Supabase configuration is unavailable.");
      const result = await supabase.from("notes").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
      if (result.error) throw result.error;
      return result.data?.user_id === user.id ? result.data : null;
    },
  });
}

function useInvalidateNotes() {
  const queryClient = useQueryClient();
  // Use the mutation's owner, not whichever account is active when it finishes.
  return async (userId: string) => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.notes(userId) });
  };
}

export function useCreateNote() {
  const { user } = useKairosAuth();
  const invalidate = useInvalidateNotes();
  return useMutation({
    mutationFn: async (input: Omit<TablesInsert<"notes">, "user_id">) => {
      if (!user) throw new Error("Sign in to create notes.");
      if (user.isPreview) throw new Error("Connect Supabase to save notes from preview mode.");
      const supabase = getOptionalSupabaseClient();
      if (!supabase) throw new Error("Supabase configuration is unavailable.");
      const result = await supabase.from("notes").insert({ ...input, user_id: user.id }).select("*").single();
      if (result.error) throw result.error;
      return result.data;
    },
    onSuccess: (note) => invalidate(note.user_id),
  });
}

export function useUpdateNote() {
  const { user } = useKairosAuth();
  const queryClient = useQueryClient();
  const invalidate = useInvalidateNotes();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: TablesUpdate<"notes"> }) => {
      if (!user) throw new Error("Sign in to update notes.");
      if (user.isPreview) throw new Error("Connect Supabase to update notes from preview mode.");
      const supabase = getOptionalSupabaseClient();
      if (!supabase) throw new Error("Supabase configuration is unavailable.");
      const result = await supabase.from("notes").update({ ...updates, user_id: user.id }).eq("id", id).eq("user_id", user.id).select("*").single();
      if (result.error) throw result.error;
      return result.data;
    },
    onSuccess: async (note) => {
      queryClient.setQueryData(noteDetailKey(note.user_id, note.id), note);
      await invalidate(note.user_id);
    },
  });
}

export function useDeleteNote() {
  const { user } = useKairosAuth();
  const queryClient = useQueryClient();
  const invalidate = useInvalidateNotes();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error("Sign in to delete notes.");
      if (user.isPreview) throw new Error("Connect Supabase to delete notes from preview mode.");
      const supabase = getOptionalSupabaseClient();
      if (!supabase) throw new Error("Supabase configuration is unavailable.");
      const result = await supabase.from("notes").delete().eq("id", id).eq("user_id", user.id);
      if (result.error) throw result.error;
      return { id, userId: user.id };
    },
    onSuccess: async ({ id, userId }) => {
      queryClient.setQueryData(noteDetailKey(userId, id), null);
      await invalidate(userId);
    },
  });
}

export function useNoteSearch(query: string) {
  const { user } = useKairosAuth();
  const userId = user?.id ?? "anonymous";
  return useQuery({
    queryKey: queryKeys.noteSearch(userId, query),
    enabled: Boolean(user && !user.isPreview && query.trim().length > 0),
    queryFn: async (): Promise<NoteSearchResult[]> => {
      const supabase = getOptionalSupabaseClient();
      if (!supabase) throw new Error("Supabase configuration is unavailable.");
      const result = await supabase.rpc("search_notes", { p_search_query: query.trim(), p_limit: 50 });
      if (result.error) throw result.error;
      return result.data ?? [];
    },
  });
}
