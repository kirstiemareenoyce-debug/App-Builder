import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useSyncExternalStore } from "react";
import { getOptionalSupabaseClient } from "@/lib/supabase";
import { queryKairosAI } from "@/lib/kairos-ai-api";
import { deleteKairosAIHistory, fetchKairosAIHistory, kairosAIHistoryKey, KAIROS_AI_SENSITIVE_META, type KairosAIHistoryDeletion } from "@/lib/kairos-ai-history";
import { deleteKairosAIHistoryAndRefresh, isKairosAIBusy, runKairosAIOperation, subscribeKairosAIOperations } from "@/lib/kairos-ai-operations";
import { useKairosAuth } from "@/providers/supabase-auth-provider";
import type { KairosAIDatabase, KairosAIInput } from "@/types/kairos-ai";

export type KairosAIQueryVariables = { input: KairosAIInput; expectedOwner: string };

function requireCloudUser(user: { id: string; isPreview: boolean } | null) {
  if (!user) throw new Error("Sign in to use Kairos AI.");
  if (user.isPreview) throw new Error("Live Kairos AI is unavailable in preview. No simulated reply is generated.");
  const client = getOptionalSupabaseClient();
  if (!client) throw new Error("Supabase configuration is unavailable.");
  return { userId: user.id, client: client as unknown as SupabaseClient<KairosAIDatabase> };
}
export function useKairosAIInteractions() {
  const { user } = useKairosAuth();
  return useQuery({
    queryKey: kairosAIHistoryKey(user?.id ?? "anonymous"),
    meta: KAIROS_AI_SENSITIVE_META,
    enabled: Boolean(user && !user.isPreview),
    queryFn: async ({ signal }) => {
      const { client, userId } = requireCloudUser(user);
      return fetchKairosAIHistory(client, userId, signal);
    },
  });
}
export function useKairosAIQueryMutation() {
  const { user } = useKairosAuth();
  const queryClient = useQueryClient();
  return useMutation({
    // Retrying a failed/ambiguous generation consumes another daily slot.
    retry: false,
    mutationKey: ["kairos-ai-query", user?.id ?? "anonymous", user?.isPreview ?? false],
    meta: KAIROS_AI_SENSITIVE_META,
    onMutate: (variables: KairosAIQueryVariables) => ({ userId: variables.expectedOwner }),
    mutationFn: async ({ input, expectedOwner }: KairosAIQueryVariables) => {
      requireCloudUser(user);
      if (!expectedOwner || user?.id !== expectedOwner) throw new Error("Your account changed. Sign in before sending.");
      return runKairosAIOperation(expectedOwner, () => queryKairosAI(input, expectedOwner));
    },
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: kairosAIHistoryKey(variables.expectedOwner) }).catch(() => undefined);
    },
  });
}

export function useKairosAIBusy() {
  const { user } = useKairosAuth();
  return useSyncExternalStore(subscribeKairosAIOperations, () => isKairosAIBusy(user?.id ?? null), () => false);
}

export function useDeleteKairosAIHistory() {
  const { user } = useKairosAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["kairos-ai-delete", user?.id ?? "anonymous"],
    meta: KAIROS_AI_SENSITIVE_META,
    retry: false,
    mutationFn: async ({ expectedOwner, target }: { expectedOwner: string; target: KairosAIHistoryDeletion }) => {
      const { client, userId } = requireCloudUser(user);
      if (userId !== expectedOwner) throw new Error("Your account changed. Sign in before deleting.");
      return runKairosAIOperation(expectedOwner, () =>
        deleteKairosAIHistoryAndRefresh(queryClient, expectedOwner, target,
          () => deleteKairosAIHistory(client, expectedOwner, target)));
    },
  });
}
