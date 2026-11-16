import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getOptionalSupabaseClient } from "@/lib/supabase";
import { getAevumErrorMessage } from "@/lib/aevum-errors";
import { relationshipEntrySchema, type RelationshipCategory, type RelationshipEntry, type RelationshipEntryInput, type RelationshipShare } from "@/lib/relationship-hub";
import { useKairosAuth } from "@/providers/supabase-auth-provider";
import { useAevumPreviewStore } from "@/store/use-aevum-preview-store";
import { getPinnedUserRequest } from "@/lib/pinned-user-client";

const entryKey = (id: string) => ["aevum-relationship-entries", id] as const;
const sharesKey = (id: string) => ["aevum-relationship-shares", id] as const;
const sensitive = { sensitive: true };

export function useRelationshipEntries(category?: RelationshipCategory) {
  const { user } = useKairosAuth();
  return useQuery({ queryKey: [...entryKey(user?.id ?? "anonymous"), category ?? "all"], enabled: Boolean(user), meta: sensitive,
    queryFn: async (): Promise<RelationshipEntry[]> => {
      if (!user) return [];
      if (user.isPreview) return useAevumPreviewStore.getState().entries.filter((e) => e.user_id === user.id && (!category || e.category === category));
      const client = getOptionalSupabaseClient();
      if (!client) throw new Error("Aevum is unavailable right now.");
      let q = client.from("aevum_relationship_entries").select("*").eq("user_id", user.id).order("updated_at", { ascending: false });
      if (category) q = q.eq("category", category);
      const r = await q;
      if (r.error) throw new Error(getAevumErrorMessage(r.error));
      return r.data;
    } });
}
export function useRelationshipShares() {
  const { user } = useKairosAuth();
  return useQuery({ queryKey: sharesKey(user?.id ?? "anonymous"), enabled: Boolean(user), meta: sensitive,
    staleTime: 0, refetchInterval: user && !user.isPreview ? 15000 : false,
    queryFn: async (): Promise<RelationshipShare[]> => {
      if (!user || user.isPreview) return [];
      const client = getOptionalSupabaseClient();
      if (!client) throw new Error("Aevum is unavailable right now.");
      const r = await client.from("aevum_relationship_shares").select("*").order("shared_at", { ascending: false });
      if (r.error) throw new Error(getAevumErrorMessage(r.error));
      return r.data;
    } });
}
function useInvalidation() {
  const { user } = useKairosAuth(); const qc = useQueryClient();
  return async () => { if (user) { await qc.invalidateQueries({ queryKey: entryKey(user.id) }); await qc.invalidateQueries({ queryKey: sharesKey(user.id) }); } };
}
export function useSaveRelationshipEntry() {
  const { user } = useKairosAuth(); const qc = useQueryClient();
  return useMutation({
    mutationKey: ["aevum-save-relationship-entry", user?.id ?? "anonymous", user?.isPreview ?? false],
    meta: sensitive,
    mutationFn: async (input: RelationshipEntryInput & { id?: string; expectedOwner: string }): Promise<RelationshipEntry> => {
    if (!user) throw new Error("Sign in before saving, or open preview for a session-only draft.");
    const { expectedOwner } = input;
    if (!expectedOwner || user.id !== expectedOwner) throw new Error("Your account changed. Sign in before saving.");
    const parsed = relationshipEntrySchema.safeParse(input);
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);
    const data = parsed.data; const now = new Date().toISOString();
    if (user.isPreview) {
      const store = useAevumPreviewStore.getState(); const old = store.entries.find((e) => e.id === input.id && e.user_id === expectedOwner);
      if (input.id && !old) throw new Error("This preview draft no longer exists.");
      const entry: RelationshipEntry = { ...data, id: old?.id ?? `preview-${Date.now()}-${Math.random().toString(36).slice(2)}`, user_id: expectedOwner, created_at: old?.created_at ?? now, updated_at: now };
      store.saveEntry(entry); return entry;
    }
    const client = getOptionalSupabaseClient(); if (!client) throw new Error("Aevum is unavailable right now.");
    const pinRequest = await getPinnedUserRequest(client, expectedOwner);
    const request = input.id ? client.from("aevum_relationship_entries").update({ ...data, updated_at: now }).eq("id", input.id).eq("user_id", expectedOwner).select("*").single()
      : client.from("aevum_relationship_entries").insert({ ...data, user_id: expectedOwner }).select("*").single();
    const r = await pinRequest(request);
    if (r.error) throw new Error(getAevumErrorMessage(r.error)); return r.data;
  }, onSuccess: (_entry, variables) => {
    // A late A save must never invalidate/repopulate B's cache after sign-out.
    void qc.invalidateQueries({ queryKey: entryKey(variables.expectedOwner) }).catch(() => undefined);
    void qc.invalidateQueries({ queryKey: sharesKey(variables.expectedOwner) }).catch(() => undefined);
  } });
}
export function useDeleteRelationshipEntry() {
  const { user } = useKairosAuth(); const invalidate = useInvalidation();
  return useMutation({ mutationFn: async (id: string) => {
    if (!user) throw new Error("Sign in before deleting an entry.");
    if (user.isPreview) { useAevumPreviewStore.getState().deleteEntry(id); return; }
    const client = getOptionalSupabaseClient(); if (!client) throw new Error("Aevum is unavailable right now.");
    const r = await client.from("aevum_relationship_entries").delete().eq("id", id).eq("user_id", user.id).select("id").single();
    if (r.error) throw new Error(getAevumErrorMessage(r.error));
  }, onSuccess: invalidate });
}
export function useShareRelationshipEntry() {
  const { user } = useKairosAuth(); const invalidate = useInvalidation();
  return useMutation({ mutationFn: async ({ entryId, connectionId, updatedAt }: { entryId: string; connectionId: string; updatedAt: string }) => {
    if (!user || user.isPreview) throw new Error("Sign in and connect an accepted partner to publish in Kairos. You can still copy a preview sample manually.");
    const client = getOptionalSupabaseClient(); if (!client) throw new Error("Aevum is unavailable right now.");
    const r = await client.rpc("share_aevum_entry", { p_entry_id: entryId, p_connection_id: connectionId, p_expected_updated_at: updatedAt });
    if (r.error) throw new Error(getAevumErrorMessage(r.error)); return r.data;
  }, onSuccess: invalidate });
}
export function useRevokeRelationshipEntry() {
  const { user } = useKairosAuth(); const invalidate = useInvalidation();
  return useMutation({ mutationFn: async (entryId: string) => {
    if (!user || user.isPreview) throw new Error("Sign in to stop in-app sharing.");
    const client = getOptionalSupabaseClient(); if (!client) throw new Error("Aevum is unavailable right now.");
    const r = await client.rpc("revoke_aevum_entry", { p_entry_id: entryId });
    if (r.error) throw new Error(getAevumErrorMessage(r.error));
  }, onSuccess: invalidate });
}
