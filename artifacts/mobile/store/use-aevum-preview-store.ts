import { create } from "zustand";
import type { AevumConsentScope, AevumProfile } from "@/types/app";
import type { RelationshipEntry } from "@/lib/relationship-hub";

/** Deliberately NOT persisted: preview personal data exists only for this app session. */
type PreviewData = { profile: AevumProfile | null; answers: Record<string, string>; consents: Partial<Record<AevumConsentScope, boolean>>; entries: RelationshipEntry[] };
const empty = (): PreviewData => ({ profile: null, answers: {}, consents: {}, entries: [] });
export const useAevumPreviewStore = create<PreviewData & {
  setProfile: (profile: AevumProfile, stage: string, answer: string) => void;
  setConsent: (scope: AevumConsentScope, granted: boolean) => void;
  saveEntry: (entry: RelationshipEntry) => void;
  deleteEntry: (id: string) => void;
  reset: () => void;
}>((set) => ({
  ...empty(),
  setProfile: (profile, stage, answer) => set((s) => ({ profile, answers: { ...s.answers, [stage]: answer } })),
  setConsent: (scope, granted) => set((s) => ({ consents: { ...s.consents, [scope]: granted } })),
  saveEntry: (entry) => set((s) => ({ entries: [entry, ...s.entries.filter((e) => e.id !== entry.id)] })),
  deleteEntry: (id) => set((s) => ({ entries: s.entries.filter((e) => e.id !== id) })),
  reset: () => set(empty()),
}));
