import { Redirect } from "expo-router";

import { StatePanel } from "@/components/kairos/state-panel";
import { ScreenContainer } from "@/components/screen-container";
import { useKairosAuth } from "@/providers/supabase-auth-provider";
import { useAppStore } from "@/store/use-app-store";

export default function EntryGate() {
  const hasHydrated = useAppStore((state) => state.hasHydrated);
  const onboardingCompleted = useAppStore((state) => state.onboardingCompleted);
  const { loading, user, enterPreviewMode } = useKairosAuth();

  if (!hasHydrated || loading) {
    return (
      <ScreenContainer edges={["top", "bottom", "left", "right"]}>
        <StatePanel loading title="Preparing Kairos" message="Restoring your private workspace…" actionLabel={hasHydrated ? "Open Preview — Skip Login" : undefined} onAction={hasHydrated ? () => { useAppStore.getState().completeOnboarding(); enterPreviewMode(); } : undefined} />
      </ScreenContainer>
    );
  }

  if (!onboardingCompleted) return <Redirect href="/(auth)/onboarding" />;
  if (!user) return <Redirect href="/(auth)/login" />;
  return <Redirect href="/(tabs)/ai" />;
}
