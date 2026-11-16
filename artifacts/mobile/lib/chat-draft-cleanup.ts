import { useAppStore } from "../store/use-app-store";

type ChatDraftSignOutOptions = {
  previewMode: boolean;
  hasSession: boolean;
  remoteSignOut: (() => Promise<{ error: unknown }>) | null;
  onSignedOut: () => void;
};

/** Do not discard private local state while a real sign-out is still pending or failed. */
export async function signOutWithChatDraftCleanup({
  previewMode,
  hasSession,
  remoteSignOut,
  onSignedOut,
}: ChatDraftSignOutOptions): Promise<void> {
  if (!previewMode && hasSession) {
    if (!remoteSignOut) {
      throw new Error("Supabase configuration is required to sign out.");
    }
    const result = await remoteSignOut();
    if (result.error) throw result.error;
  }

  // Use the normal persisted store action, rather than deleting app preferences.
  useAppStore.getState().clearChatDraft();
  onSignedOut();
}
