import { useMutation } from "@tanstack/react-query";
import { requestAevumCoaching, type AevumCoachingVariables } from "@/lib/aevum-api";
import { KairosApiError } from "@/lib/evergreen-api";
import { useKairosAuth } from "@/providers/supabase-auth-provider";

export function useAevumCoachingMutation() {
  const { user } = useKairosAuth();
  return useMutation({
    // Detach B's observer options from A's pending asynchronous startup.
    mutationKey: ["aevum-coaching", user?.id ?? "anonymous"],
    mutationFn: async (input: AevumCoachingVariables) => {
      if (!user || user.isPreview) {
        throw new KairosApiError("Sign in outside preview mode before requesting coaching.", "AUTH_REQUIRED");
      }
      // The closure is only a no-preview gate. Authentication checks use the
      // action's input.expectedOwner, not the user from a later render.
      return requestAevumCoaching(input);
    },
    retry: false,
  });
}
