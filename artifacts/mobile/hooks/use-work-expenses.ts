import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getOptionalSupabaseClient } from "@/lib/supabase";
import { validateReceiptAttachment, type WorkExpenseInput } from "@/lib/work-expenses";
import { useKairosAuth } from "@/providers/supabase-auth-provider";
import type { Tables, TablesInsert } from "@/types/database";

export type WorkExpenseWithReceipt = Tables<"work_expenses"> & { receiptUrl: string | null };
type ReceiptUpload = { uri: string; mimeType?: string | null; fileName?: string | null; fileSize?: number | null };
type CreateWorkExpense = { form: WorkExpenseInput; receipt: ReceiptUpload | null };

const expensesKey = (userId: string) => ["work-expenses", userId] as const;

export function useWorkExpenses() {
  const { user } = useKairosAuth();
  return useQuery({
    queryKey: expensesKey(user?.id ?? "anonymous"),
    enabled: Boolean(user && !user.isPreview),
    meta: { sensitive: true },
    queryFn: async (): Promise<WorkExpenseWithReceipt[]> => {
      const supabase = getOptionalSupabaseClient();
      if (!supabase) throw new Error("Supabase configuration is unavailable.");
      const result = await supabase.from("work_expenses").select("*").order("expense_date", { ascending: false }).order("created_at", { ascending: false }).limit(500);
      if (result.error) throw result.error;
      return Promise.all((result.data ?? []).map(async (expense) => {
        if (!expense.attachment_path) return { ...expense, receiptUrl: null };
        const signed = await supabase.storage.from("work-receipts").createSignedUrl(expense.attachment_path, 60 * 60);
        if (signed.error) throw signed.error;
        return { ...expense, receiptUrl: signed.data.signedUrl };
      }));
    },
  });
}

export function useCreateWorkExpense() {
  const { user } = useKairosAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ form, receipt }: CreateWorkExpense) => {
      if (!user) throw new Error("Sign in to save a receipt.");
      if (user.isPreview) throw new Error("Preview records are session-only; connect Supabase to save them to your account.");
      const supabase = getOptionalSupabaseClient();
      if (!supabase) throw new Error("Supabase configuration is unavailable.");
      let attachmentPath: string | null = null;
      let attachmentMimeType: string | null = null;
      let attachmentBytes: number | null = null;
      if (receipt) {
        const mimeType = validateReceiptAttachment(receipt);
        const response = await fetch(receipt.uri);
        if (!response.ok) throw new Error("The selected receipt photo could not be read.");
        const blob = await response.blob();
        validateReceiptAttachment({ mimeType, fileName: receipt.fileName, fileSize: blob.size });
        attachmentMimeType = mimeType;
        attachmentBytes = blob.size;
        const extension = mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1];
        attachmentPath = `${user.id}/${Date.now()}-${Math.random().toString(16).slice(2)}.${extension}`;
        const upload = await supabase.storage.from("work-receipts").upload(attachmentPath, blob, { contentType: mimeType, upsert: false });
        if (upload.error) throw upload.error;
      }
      const input: TablesInsert<"work_expenses"> = {
        ...form,
        user_id: user.id,
        attachment_path: attachmentPath,
        attachment_mime_type: attachmentMimeType,
        attachment_bytes: attachmentBytes,
      };
      const inserted = await supabase.from("work_expenses").insert(input).select("*").single();
      if (inserted.error) {
        if (attachmentPath) await supabase.storage.from("work-receipts").remove([attachmentPath]);
        throw inserted.error;
      }
      return inserted.data;
    },
    onSuccess: async () => {
      if (user) await queryClient.invalidateQueries({ queryKey: expensesKey(user.id) });
    },
  });
}

export function useDeleteWorkExpense() {
  const { user } = useKairosAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error("Sign in to remove a receipt.");
      if (user.isPreview) throw new Error("Preview records can only be removed from the open session.");
      const supabase = getOptionalSupabaseClient();
      if (!supabase) throw new Error("Supabase configuration is unavailable.");
      const removed = await supabase.from("work_expenses").delete().eq("id", id).select("attachment_path").single();
      if (removed.error) throw removed.error;
      if (removed.data.attachment_path) {
        const storageRemoval = await supabase.storage.from("work-receipts").remove([removed.data.attachment_path]);
        return { photoCleanupPending: Boolean(storageRemoval.error) };
      }
      return { photoCleanupPending: false };
    },
    onSuccess: async () => {
      if (user) await queryClient.invalidateQueries({ queryKey: expensesKey(user.id) });
    },
  });
}
