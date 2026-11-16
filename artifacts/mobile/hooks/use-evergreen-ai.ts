import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchLatestChatHistory } from "@/lib/chat-history";
import {
  getEvergreenMetrics,
  queryEvergreen,
  submitEvergreenFeedback,
  type EvergreenFeedbackVariables,
  type EvergreenQueryVariables,
} from "@/lib/evergreen-api";
import { getOptionalSupabaseClient } from "@/lib/supabase";
import { useKairosAuth } from "@/providers/supabase-auth-provider";
import { queryKeys, type Interaction } from "@/types/app";

function requireCloudUser(userId: string, isPreview: boolean) {
  if (isPreview) throw new Error("Connect Supabase to send a live Evergreen AI request from preview mode.");
  const supabase = getOptionalSupabaseClient();
  if (!supabase) throw new Error("Supabase configuration is unavailable.");
  return { supabase, userId };
}

export function useEvergreenInteractions() {
  const { user } = useKairosAuth();
  const userId = user?.id ?? "anonymous";
  return useQuery({
    queryKey: queryKeys.interactions(userId),
    enabled: Boolean(user && !user.isPreview),
    queryFn: async (): Promise<Interaction[]> => {
      if (!user) return [];
      const { supabase } = requireCloudUser(user.id, user.isPreview);
      return fetchLatestChatHistory(supabase, user.id);
    },
  });
}

export function useEvergreenQueryMutation() {
  const { user } = useKairosAuth();
  const queryClient = useQueryClient();
  return useMutation({
    // A changed key detaches the observer instead of rebinding pending A's
    // mutation to B's options during TanStack's asynchronous startup.
    mutationKey: ["evergreen-query", user?.id ?? "anonymous"],
    onMutate: (input: EvergreenQueryVariables) => ({ userId: input.expectedOwner }),
    mutationFn: async (input: EvergreenQueryVariables) => {
      if (!user) throw new Error("Sign in to talk with Evergreen AI.");
      requireCloudUser(input.expectedOwner, user.isPreview);
      return queryEvergreen(input);
    },
    onSuccess: (_result, input) => {
      if (!input.expectedOwner) return;
      // A successful response must reach the screen immediately, even if
      // refreshing history is slow or fails. Scope refreshes to the sender.
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.interactions(input.expectedOwner) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.metrics(input.expectedOwner) }),
      ]).catch(() => undefined);
    },
  });
}

export function useEvergreenFeedbackMutation() {
  const { user } = useKairosAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["evergreen-feedback", user?.id ?? "anonymous"],
    mutationFn: async (input: EvergreenFeedbackVariables) => {
      if (!user) throw new Error("Sign in to submit feedback.");
      requireCloudUser(input.expectedOwner, user.isPreview);
      return submitEvergreenFeedback(input);
    },
    onSuccess: async (_result, input) => {
      if (input.expectedOwner) await queryClient.invalidateQueries({ queryKey: queryKeys.metrics(input.expectedOwner) });
    },
  });
}

export function useEvergreenMetrics() {
  const { user } = useKairosAuth();
  const userId = user?.id ?? "anonymous";
  return useQuery({
    queryKey: queryKeys.metrics(userId),
    enabled: Boolean(user && !user.isPreview),
    queryFn: async () => {
      if (!user) throw new Error("Sign in to view learning metrics.");
      requireCloudUser(user.id, user.isPreview);
      return getEvergreenMetrics();
    },
  });
}
