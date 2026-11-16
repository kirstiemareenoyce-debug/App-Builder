import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { getOptionalSupabaseClient } from "@/lib/supabase";
import { queryKairosAI } from "@/lib/kairos-ai-api";
import { deleteKairosAIHistory, fetchKairosAIHistory, kairosAIHistoryKey, KAIROS_AI_SENSITIVE_META, type KairosAIHistoryDeletion } from "@/lib/kairos-ai-history";
import { deleteKairosAIHistoryAndRefresh, isKairosAIBusy, runKairosAIOperation, subscribeKairosAIOperations } from "@/lib/kairos-ai-operations";
import { useKairosAuth } from "@/providers/supabase-auth-provider";
import {
  fetchKairosAIAllowance, kairosAIAllowanceFreshFor, kairosAIAllowanceKey,
  kairosAIAllowanceText, refreshKairosAIAllowance, refreshKairosAIAllowanceAfterAttempt,
} from "@/lib/kairos-ai-allowance";
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
export function useKairosAIAllowance() {
  const { user } = useKairosAuth();
  const queryClient = useQueryClient();
  const owner = user && !user.isPreview ? user.id : null;
  const [now, setNow] = useState(Date.now);
  const query = useQuery({
    queryKey: kairosAIAllowanceKey(owner ?? "anonymous"),
    meta: KAIROS_AI_SENSITIVE_META,
    enabled: Boolean(owner),
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    refetchInterval: 15_000,
    queryFn: ({ signal }) => {
      const { client, userId } = requireCloudUser(user);
      return fetchKairosAIAllowance(client, userId, signal);
    },
  });
  const refresh = useCallback(() => {
    if (!owner) return Promise.resolve();
    setNow(Date.now());
    return refreshKairosAIAllowance(queryClient, owner);
  }, [owner, queryClient]);
  useFocusEffect(useCallback(() => {
    void refresh().catch(() => undefined);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh().catch(() => undefined);
    });
    return () => subscription.remove();
  }, [refresh]));
  useEffect(() => {
    if (!owner) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [owner]);
  useEffect(() => {
    if (!owner || !query.data) return;
    const remaining = kairosAIAllowanceFreshFor(query.data, Date.now());
    if (!remaining) return;
    const timer = setTimeout(() => { void refresh().catch(() => undefined); }, remaining);
    return () => clearTimeout(timer);
  }, [owner, query.data, refresh]);
  const invalid = query.isError || query.isFetching ||
    (queryClient.getQueryState(kairosAIAllowanceKey(owner ?? "anonymous"))?.isInvalidated ?? true);
  return {
    text: !user ? "Sign in to check your daily AI allowance."
      : user.isPreview ? "Daily AI allowance is unavailable in preview; no live status is read."
      : query.isPending || query.isFetching ? "Checking your daily AI allowance…"
      : query.isError ? "Daily AI allowance is unavailable. Refresh to retry; sending is still checked by the server."
      : kairosAIAllowanceText(query.data, owner, Math.max(now, Date.now()), invalid),
    refresh, isFetching: query.isFetching, canRefresh: Boolean(owner),
  };
}
export function useKairosAIQueryMutation() {
  const { user } = useKairosAuth();
  const queryClient = useQueryClient();
  return useMutation({
    // Retrying a failed/ambiguous generation consumes another daily slot.
    retry: false,
    mutationKey: ["kairos-ai-query", user?.id ?? "anonymous", user?.isPreview ?? false],
    meta: KAIROS_AI_SENSITIVE_META,
    onMutate: async (variables: KairosAIQueryVariables) => {
      const queryKey = kairosAIAllowanceKey(variables.expectedOwner);
      await queryClient.cancelQueries({ queryKey, exact: true });
      await queryClient.invalidateQueries({ queryKey, exact: true, refetchType: "none" });
      return { userId: variables.expectedOwner };
    },
    mutationFn: async ({ input, expectedOwner }: KairosAIQueryVariables) => {
      requireCloudUser(user);
      if (!expectedOwner || user?.id !== expectedOwner) throw new Error("Your account changed. Sign in before sending.");
      return runKairosAIOperation(expectedOwner, () => queryKairosAI(input, expectedOwner));
    },
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: kairosAIHistoryKey(variables.expectedOwner) }).catch(() => undefined);
    },
    onSettled: (_result, _error, variables) => {
      // A failed or ambiguous attempt may have consumed a reservation too.
      // Do not return the refresh promise: a stalled status read must not keep
      // mutateAsync pending after generation has already succeeded or failed.
      refreshKairosAIAllowanceAfterAttempt(queryClient, variables.expectedOwner);
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
