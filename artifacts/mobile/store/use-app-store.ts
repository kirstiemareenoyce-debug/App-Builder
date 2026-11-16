import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { ThemePreference } from "@/types/app";

export const PREVIEW_CHAT_DRAFT_OWNER = "00000000-0000-4000-8000-000000000001:preview";

type AppState = {
  hasHydrated: boolean;
  onboardingCompleted: boolean;
  themePreference: ThemePreference;
  chatDraft: string;
  chatDraftOwner: string | null;
  // Runtime-only auth binding. Persisted ownership is not proof of a session.
  chatDraftActiveOwner: string | null;
  chatDraftOwnerConfirmed: boolean;
  previewMode: boolean;
  markHydrated: () => void;
  completeOnboarding: () => void;
  resetOnboarding: () => void;
  setThemePreference: (preference: ThemePreference) => void;
  setChatDraft: (draft: string, expectedOwner?: string | null) => void;
  bindChatDraftOwner: (owner: string | null) => void;
  clearChatDraft: () => void;
  setPreviewMode: (enabled: boolean) => void;
};

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      hasHydrated: false,
      onboardingCompleted: false,
      themePreference: "dark",
      chatDraft: "",
      chatDraftOwner: null,
      chatDraftActiveOwner: null,
      chatDraftOwnerConfirmed: false,
      previewMode: false,
      markHydrated: () => set({ hasHydrated: true }),
      completeOnboarding: () => set({ onboardingCompleted: true }),
      resetOnboarding: () => set({ onboardingCompleted: false }),
      setThemePreference: (themePreference) => set({ themePreference }),
      setChatDraft: (chatDraft, expectedOwner) => {
        const state = get();
        if (expectedOwner !== undefined && (!state.chatDraftOwnerConfirmed ||
          !expectedOwner || expectedOwner !== state.chatDraftActiveOwner)) return;
        set({ chatDraft, chatDraftOwner: state.chatDraftActiveOwner });
      },
      bindChatDraftOwner: (owner) => set((state) => ({
        chatDraftActiveOwner: owner,
        chatDraftOwnerConfirmed: true,
        // Never adopt an unowned legacy draft, or another account's draft.
        ...(owner && state.chatDraftOwner === owner
          ? {} : { chatDraft: "", chatDraftOwner: null }),
      })),
      clearChatDraft: () => set({ chatDraft: "", chatDraftOwner: null }),
      setPreviewMode: (previewMode) => set((state) => state.previewMode === previewMode ? {} : {
        previewMode,
        chatDraft: "",
        chatDraftOwner: null,
        chatDraftActiveOwner: previewMode ? PREVIEW_CHAT_DRAFT_OWNER : null,
        chatDraftOwnerConfirmed: previewMode,
      }),
    }),
    {
      name: "kairos-app-state-v1",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ onboardingCompleted, themePreference, chatDraft, chatDraftOwner, previewMode }) => ({
        onboardingCompleted,
        themePreference,
        chatDraft,
        chatDraftOwner,
        previewMode,
      }),
      merge: (persisted, current) => {
        const saved = persisted as Partial<AppState> | undefined;
        const savedOwner = typeof saved?.chatDraftOwner === "string" ? saved.chatDraftOwner : null;
        // Hydration may finish after auth confirms B. Do not restore A's text or
        // stale preview state over a confirmed runtime identity.
        const canRestoreDraft = savedOwner !== null && (!current.chatDraftOwnerConfirmed ||
          savedOwner === current.chatDraftActiveOwner);
        const hasCurrentDraft = current.chatDraftOwnerConfirmed && current.chatDraftOwner !== null &&
          current.chatDraftOwner === current.chatDraftActiveOwner;
        return {
          ...current,
          onboardingCompleted: saved?.onboardingCompleted ?? current.onboardingCompleted,
          themePreference: saved?.themePreference ?? current.themePreference,
          previewMode: current.chatDraftOwnerConfirmed ? current.previewMode : saved?.previewMode ?? current.previewMode,
          chatDraft: hasCurrentDraft ? current.chatDraft : canRestoreDraft && typeof saved?.chatDraft === "string" ? saved.chatDraft : "",
          chatDraftOwner: hasCurrentDraft ? current.chatDraftOwner : canRestoreDraft ? savedOwner : null,
        };
      },
      onRehydrateStorage: () => (state) => state?.markHydrated(),
    },
  ),
);
