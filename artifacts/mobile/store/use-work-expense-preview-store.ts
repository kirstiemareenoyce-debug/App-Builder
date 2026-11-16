import { create } from "zustand";
import type { Tables } from "@/types/database";

export type PreviewWorkExpense = Tables<"work_expenses"> & { previewUri: string | null };

type PreviewState = { expenses: PreviewWorkExpense[] };
const empty = (): PreviewState => ({ expenses: [] });

export const useWorkExpensePreviewStore = create<PreviewState & {
  addExpense: (expense: PreviewWorkExpense) => void;
  deleteExpense: (id: string) => void;
  reset: () => void;
}>((set) => ({
  ...empty(),
  addExpense: (expense) => set((state) => ({ expenses: [expense, ...state.expenses] })),
  deleteExpense: (id) => set((state) => ({ expenses: state.expenses.filter((expense) => expense.id !== id) })),
  reset: () => set(empty()),
}));
