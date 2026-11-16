import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getOptionalSupabaseClient } from "@/lib/supabase";
import { getAevumErrorMessage } from "@/lib/aevum-errors";
import { useKairosAuth } from "@/providers/supabase-auth-provider";
import { queryKeys, type PartnerConnection } from "@/types/app";
import type { TablesUpdate } from "@/types/database";

export function usePartnerConnection() {
  const { user } = useKairosAuth();
  const userId = user?.id ?? "anonymous";
  return useQuery({
    queryKey: queryKeys.partner(userId),
    enabled: Boolean(user && !user.isPreview),
    meta: { sensitive: true },
    staleTime: 0,
    refetchInterval: user && !user.isPreview ? 15000 : false,
    queryFn: async (): Promise<PartnerConnection | null> => {
      const supabase = getOptionalSupabaseClient();
      if (!supabase) throw new Error("Supabase configuration is unavailable.");
      const result = await supabase
        .from("partner_connections")
        .select("*")
        .or(`requester_id.eq.${userId},recipient_id.eq.${userId}`)
        .order("updated_at", { ascending: false })
        .limit(50);
      if (result.error) throw result.error;
      return result.data.find((connection) => connection.status === "accepted") ?? result.data[0] ?? null;
    },
  });
}

export function usePartnerConnections() {
  const { user } = useKairosAuth();
  return useQuery({ queryKey: ["partner", user?.id ?? "anonymous", "all"], enabled: Boolean(user && !user.isPreview), meta: { sensitive: true }, staleTime: 0, refetchInterval: user && !user.isPreview ? 15000 : false,
    queryFn: async (): Promise<PartnerConnection[]> => {
      if (!user || user.isPreview) return [];
      const client = getOptionalSupabaseClient(); if (!client) throw new Error("Aevum is unavailable right now.");
      const r = await client.from("partner_connections").select("*").or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`).order("updated_at", { ascending: false }).limit(50);
      if (r.error) throw new Error(getAevumErrorMessage(r.error)); return r.data;
    } });
}

function useInvalidatePartner() {
  const { user } = useKairosAuth();
  const queryClient = useQueryClient();
  return async () => {
    if (user) {
      await queryClient.invalidateQueries({ queryKey: queryKeys.partner(user.id) });
      await queryClient.invalidateQueries({ queryKey: ["aevum-relationship-shares", user.id] });
    }
  };
}

export function useRequestPartner() {
  const { user } = useKairosAuth();
  const invalidate = useInvalidatePartner();
  return useMutation({
    mutationFn: async (recipientId: string) => {
      if (!user) throw new Error("Sign in to connect with a partner.");
      if (user.isPreview) throw new Error("Connect Supabase to send a partner request from preview mode.");
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(recipientId)) throw new Error("Enter your partner's Kairos account ID.");
      if (recipientId === user.id) throw new Error("Use another Kairos account ID.");
      const supabase = getOptionalSupabaseClient();
      if (!supabase) throw new Error("Supabase configuration is unavailable.");
      const result = await supabase.from("partner_connections").insert({ requester_id: user.id, recipient_id: recipientId }).select("*").single();
      if (result.error) throw result.error;
      return result.data;
    },
    onSuccess: invalidate,
  });
}

export function useUpdatePartnerConnection() {
  const { user } = useKairosAuth();
  const invalidate = useInvalidatePartner();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: TablesUpdate<"partner_connections"> }) => {
      if (!user) throw new Error("Sign in to update a partner connection.");
      if (user.isPreview) throw new Error("Connect Supabase to update this connection from preview mode.");
      const supabase = getOptionalSupabaseClient();
      if (!supabase) throw new Error("Supabase configuration is unavailable.");
      if (!updates.status) throw new Error("Choose a partner connection action.");
      const result = await supabase.rpc("set_aevum_partner_connection", { p_connection_id: id, p_status: updates.status });
      if (result.error) throw new Error(getAevumErrorMessage(result.error));
      return result.data;
    },
    onSuccess: invalidate,
  });
}
