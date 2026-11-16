import { buildSummaryClipboardText, type SafeSummary } from "./aevum-summary";

/** No clipboard reads or legacy fallback that could silently report a failed copy as success. */
export async function copySafeSummary(input: SafeSummary): Promise<void> {
  const text = buildSummaryClipboardText(input);
  try {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) throw new Error("Clipboard unavailable.");
    // Keep this write within the user's click gesture; no permission prompt or network await first.
    await navigator.clipboard.writeText(text);
  } catch {
    throw new Error("Your browser could not copy the summary. Open Kairos directly in a secure browser tab, select the summary text to copy manually, or export it as a text file.");
  }
}
