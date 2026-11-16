import { create } from "zustand";
import type { RelationshipMediaItem } from "@/lib/relationship-media";

export type PreviewRelationshipMedia = RelationshipMediaItem & {
  preview_uri: string | null;
  photo_url: string | null;
};

type PreviewData = { items: PreviewRelationshipMedia[] };
const empty = (): PreviewData => ({ items: [] });

/** Preview media is intentionally volatile; it is not written to AsyncStorage or Supabase. */
export const useRelationshipMediaPreviewStore = create<
  PreviewData & {
    saveItem: (item: PreviewRelationshipMedia) => void;
    deleteItem: (id: string) => void;
    reset: () => void;
  }
>((set) => ({
  ...empty(),
  saveItem: (item) =>
    set((state) => ({
      items: [item, ...state.items.filter((saved) => saved.id !== item.id)],
    })),
  deleteItem: (id) =>
    set((state) => ({ items: state.items.filter((item) => item.id !== id) })),
  reset: () => set(empty()),
}));
