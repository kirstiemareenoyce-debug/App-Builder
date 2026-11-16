import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useEffect, useRef } from "react";

import { StatePanel } from "@/components/kairos/state-panel";
import { ScreenContainer } from "@/components/screen-container";
import { previewDestination } from "@/lib/preview-destinations";
import { useKairosAuth } from "@/providers/supabase-auth-provider";
import { useAppStore } from "@/store/use-app-store";

export default function PreviewEntryScreen() {
  const { next } = useLocalSearchParams<{ next?: string | string[] }>();
  const target = previewDestination(next);
  const { user, enterPreviewMode } = useKairosAuth();
  const router = useRouter();
  const entered = useRef(false);

  useEffect(() => {
    if (entered.current) return;
    entered.current = true;
    useAppStore.getState().completeOnboarding();
    enterPreviewMode();
  }, [enterPreviewMode]);

  useEffect(() => {
    if (user?.isPreview) router.replace(target as Href);
  }, [router, target, user?.isPreview]);

  return <ScreenContainer><StatePanel loading title="Opening preview" message="No account, cloud saves or live AI calls. Preview does not unlock private records." /></ScreenContainer>;
}
