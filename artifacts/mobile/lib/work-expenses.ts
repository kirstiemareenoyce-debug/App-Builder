import { z } from "zod";

export const MAX_RECEIPT_FILE_BYTES = 5 * 1024 * 1024;
export const RECEIPT_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date in YYYY-MM-DD format.").refine((value) => {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}, "Enter a real calendar date.");

export const workExpenseSchema = z.object({
  merchant: z.string().trim().min(1, "Enter a shop or merchant.").max(120, "Merchant must be 120 characters or fewer."),
  amount: z.string().trim().regex(/^\d{1,9}(?:\.\d{1,2})?$/, "Enter an amount with up to two decimal places.").transform(Number).refine((value) => Number.isFinite(value) && value > 0, "Amount must be greater than zero."),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Use a three-letter currency code, such as AUD."),
  expense_date: isoDateSchema,
  notes: z.string().trim().max(2000, "Notes must be 2,000 characters or fewer."),
});

export type WorkExpenseInput = z.infer<typeof workExpenseSchema>;

export function normalizeReceiptMimeType(mimeType?: string | null, fileName?: string | null): (typeof RECEIPT_MIME_TYPES)[number] | null {
  const normalized = mimeType?.toLowerCase().split(";")[0]?.trim();
  if (RECEIPT_MIME_TYPES.includes(normalized as (typeof RECEIPT_MIME_TYPES)[number])) {
    return normalized as (typeof RECEIPT_MIME_TYPES)[number];
  }
  const extension = fileName?.toLowerCase().split(".").pop();
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  return null;
}

export function validateReceiptAttachment(input: { mimeType?: string | null; fileName?: string | null; fileSize?: number | null }) {
  const mimeType = normalizeReceiptMimeType(input.mimeType, input.fileName);
  if (!mimeType) throw new Error("Choose a JPEG, PNG, or WebP receipt photo.");
  if (input.fileSize != null && (!Number.isFinite(input.fileSize) || input.fileSize < 1 || input.fileSize > MAX_RECEIPT_FILE_BYTES)) {
    throw new Error("Receipt photos must be between 1 byte and 5 MB.");
  }
  return mimeType;
}
