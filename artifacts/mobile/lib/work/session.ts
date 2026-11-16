import { useLayoutEffect, useRef } from "react";
import { useKairosAuth } from "../../providers/supabase-auth-provider";
import {
  bindWorkIdentity,
  workIdentityEpoch,
} from "../../store/use-work-preview-store";
import { getWorkClient } from "./client";
export type WorkGuard = {
  owner: string;
  preview: boolean;
  current: () => boolean;
  assert: () => void;
  cloud: () => Promise<void>;
};
export function useWorkSession() {
  const { user, session, loading } = useKairosAuth();
  const identity = `${user?.id ?? "anonymous"}:${user?.isPreview ? "preview" : "cloud"}`;
  const ref = useRef({ identity, alive: true });
  ref.current.identity = identity;
  useLayoutEffect(() => {
    const lifetime = ref.current;
    lifetime.alive = true;
    bindWorkIdentity(identity);
    return () => {
      lifetime.alive = false;
    };
  }, [identity]);
  return {
    user,
    identity,
    loading,
    capture(): WorkGuard {
      if (!user || loading)
        throw new Error("Sign in or enter preview before using Work.");
      if (!user.isPreview && session?.user.id !== user.id)
        throw new Error("Your signed-in session is unavailable.");
      const owner = user.id,
        preview = user.isPreview,
        epoch = workIdentityEpoch();
      const current = () =>
        ref.current.alive &&
        ref.current.identity === identity &&
        epoch === workIdentityEpoch();
      const assert = () => {
        if (!current())
          throw new Error(
            "Work operation cancelled because the account or screen changed.",
          );
      };
      return {
        owner,
        preview,
        current,
        assert,
        cloud: async () => {
          assert();
          if (preview)
            throw new Error("Preview cannot access Work cloud records.");
          const result = await getWorkClient().auth.getSession();
          assert();
          if (result.error || result.data.session?.user.id !== owner)
            throw new Error("The signed-in account changed. Try again.");
        },
      };
    },
  };
}
